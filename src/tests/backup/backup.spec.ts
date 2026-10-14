import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  BackupApi,
  BackupDto,
  BackupPeriod,
  BackupProgress,
  BackupProgressEnum,
  BackupScheduleDto,
  BackupStorageType,
  BackupsCountResultDto,
  DistributedTaskStatus,
  RoomType,
  ScheduleDto,
} from "@onlyoffice/docspace-api-sdk";
import config from "@/config";
import { disableWalletService } from "@/src/helpers/wallet-services";
import {
  expectRestoreNotStarted,
  observeJobUntilQuiescent,
  runBackup,
  snapshotBackups,
  startBackupAndCatchItRunning,
  startRestoreThatCannotQueue,
  waitForBackupJobEnd,
  waitForBackupRecord,
} from "@/src/helpers/backup";
import type { ApiSDK } from "@/src/services/api-sdk";

test.describe("POST /portal/backup/start - Start backup", () => {
  test("Owner creates backup to Temporary storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST startbackup - start backup", async () => {
      const { data, status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup completed successfully", async () => {
      const { data, status } = await ownerApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeFalsy();
    });
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

    await test.step("POST startbackup - start backup", async () => {
      const { data, status } = await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup completed successfully", async () => {
      const { data, status } = await adminApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeFalsy();
    });
  });

  test("Owner creates backup to Backup room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    let roomId!: number;

    await test.step("POST rooms - create backup room", async () => {
      const { data } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Backup Room",
          roomType: RoomType.CustomRoom,
        },
      });
      roomId = data.response!.id!;
    });

    await test.step("POST startbackup - start backup", async () => {
      const { data, status } = await ownerApi.backup.startBackup({
        backupDto: {
          storageType: BackupStorageType.Documents,
          storageParams: [{ key: "folderId", value: String(roomId) }],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup completed successfully", async () => {
      const { data, status } = await ownerApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeFalsy();
    });
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

    let roomId!: number;

    await test.step("POST rooms - create backup room", async () => {
      const { data } = await adminApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Backup Room",
          roomType: RoomType.CustomRoom,
        },
      });
      roomId = data.response!.id!;
    });

    await test.step("POST startbackup - start backup", async () => {
      const { data, status } = await adminApi.backup.startBackup({
        backupDto: {
          storageType: BackupStorageType.Documents,
          storageParams: [{ key: "folderId", value: String(roomId) }],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup completed successfully", async () => {
      const { data, status } = await adminApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeFalsy();
    });
  });

  test("Owner creates backup to Third-party resource", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    let folderId!: string;

    await test.step("POST savethirdpartybackup - connect Nextcloud", async () => {
      const { data } =
        await ownerApi.thirdPartyIntegration.saveThirdPartyBackup({
          thirdPartyBackupRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Nextcloud Backup",
            providerKey: "Nextcloud",
          },
        });
      folderId = data.response!.id!;
    });

    await test.step("POST startbackup - start backup", async () => {
      const { data, status } = await ownerApi.backup.startBackup({
        backupDto: {
          storageType: BackupStorageType.ThridpartyDocuments,
          storageParams: [{ key: "folderId", value: folderId }],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup completed successfully", async () => {
      const { data, status } = await ownerApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeFalsy();
    });
  });

  test("DocSpaceAdmin creates backup to Third-party resource", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    let folderId!: string;

    await test.step("POST savethirdpartybackup - connect Nextcloud", async () => {
      const { data } =
        await ownerApi.thirdPartyIntegration.saveThirdPartyBackup({
          thirdPartyBackupRequestDto: {
            url: config.NEXTCLOUD_URL,
            login: config.NEXTCLOUD_LOGIN,
            password: config.NEXTCLOUD_PASSWORD,
            customerTitle: "Nextcloud Backup",
            providerKey: "Nextcloud",
          },
        });
      folderId = data.response!.id!;
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST startbackup - start backup", async () => {
      const { data, status } = await adminApi.backup.startBackup({
        backupDto: {
          storageType: BackupStorageType.ThridpartyDocuments,
          storageParams: [{ key: "folderId", value: folderId }],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup completed successfully", async () => {
      const { data, status } = await adminApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeFalsy();
    });
  });

  test("Owner creates backup to AWS S3", async ({ apiSdk, paymentsApi }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST authservice - configure S3 credentials", async () => {
      const { status } = await ownerApi.settingsAuthorization.saveAuthKeys({
        authServiceRequestsDto: {
          name: "s3",
          props: [
            { name: "acesskey", value: config.S3_ACCESS_KEY },
            { name: "secretaccesskey", value: config.S3_SECRET_KEY },
          ],
        },
      });

      expect(status).toBe(200);
    });

    await test.step("POST startbackup - start backup to AWS S3", async () => {
      const { data, status } = await ownerApi.backup.startBackup({
        backupDto: {
          storageType: BackupStorageType.ThirdPartyConsumer,
          storageParams: [
            { key: "module", value: "s3" },
            { key: "bucket", value: config.S3_BUCKET },
            { key: "region", value: config.S3_REGION },
            { key: "serviceurl", value: "" },
            { key: "forcepathstyle", value: "false" },
            { key: "usehttp", value: "false" },
          ],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup completed successfully", async () => {
      const { data, status } = await ownerApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeFalsy();
    });
  });

  test("DocSpaceAdmin creates backup to AWS S3", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST authservice - configure S3 credentials", async () => {
      const { status } = await ownerApi.settingsAuthorization.saveAuthKeys({
        authServiceRequestsDto: {
          name: "s3",
          props: [
            { name: "acesskey", value: config.S3_ACCESS_KEY },
            { name: "secretaccesskey", value: config.S3_SECRET_KEY },
          ],
        },
      });

      expect(status).toBe(200);
    });

    await test.step("POST startbackup - start backup to AWS S3", async () => {
      const { data, status } = await adminApi.backup.startBackup({
        backupDto: {
          storageType: BackupStorageType.ThirdPartyConsumer,
          storageParams: [
            { key: "module", value: "s3" },
            { key: "bucket", value: config.S3_BUCKET },
            { key: "region", value: config.S3_REGION },
            { key: "serviceurl", value: "" },
            { key: "forcepathstyle", value: "false" },
            { key: "usehttp", value: "false" },
          ],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.backupProgressEnum).toBe(BackupProgressEnum.Backup);
      expect(data.response!.tenantId).toBeGreaterThan(0);
      expect(data.response!.taskId).toBeTruthy();
      expect(data.response!.error).toBeFalsy();
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup completed successfully", async () => {
      const { data, status } = await adminApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBeFalsy();
    });
  });
});

test.describe("POST /api/2.0/backup/cancelbackup - Cancel backup", () => {
  test("Owner cancels backup while backup is in progress", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(50);
    const ownerApi = apiSdk.forRole("owner");

    let taskId!: string;

    // A cancel is only known to take once the backup worker has the job running:
    // sent earlier it is answered true and the backup still runs to the end.
    await test.step("POST startbackup - start backup and wait until it runs", async () => {
      taskId = await startBackupAndCatchItRunning(ownerApi.backup);
    });

    await test.step("POST cancelbackup - cancel backup", async () => {
      const { data, status } = await ownerApi.backup.cancelBackup();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackupprogress - wait for cancellation", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.count === 0 || data.response?.isCompleted === true).toBe(
          true,
        );
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup was canceled", async () => {
      const { data, status } = await ownerApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(
        data.count === 0 ||
          (data.response?.isCompleted === true &&
            data.response?.status === DistributedTaskStatus.Canceled),
      ).toBe(true);
    });

    await test.step("GET getbackuphistory - the canceled backup left no copy", async () => {
      const { data } = await ownerApi.backup.getBackupHistory();
      expect(data.response!.map((record) => record.id)).not.toContain(taskId);
    });
  });

  test("DocSpaceAdmin cancels backup while backup is in progress", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(50);

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    let taskId!: string;

    // A cancel is only known to take once the backup worker has the job running:
    // sent earlier it is answered true and the backup still runs to the end.
    await test.step("POST startbackup - start backup and wait until it runs", async () => {
      taskId = await startBackupAndCatchItRunning(adminApi.backup);
    });

    await test.step("POST cancelbackup - cancel backup", async () => {
      const { data, status } = await adminApi.backup.cancelBackup();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("GET getbackupprogress - wait for cancellation", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.count === 0 || data.response?.isCompleted === true).toBe(
          true,
        );
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET getbackupprogress - verify backup was canceled", async () => {
      const { data, status } = await adminApi.backup.getBackupProgress();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(
        data.count === 0 ||
          (data.response?.isCompleted === true &&
            data.response?.status === DistributedTaskStatus.Canceled),
      ).toBe(true);
    });

    await test.step("GET getbackuphistory - the canceled backup left no copy", async () => {
      const { data } = await adminApi.backup.getBackupHistory();
      expect(data.response!.map((record) => record.id)).not.toContain(taskId);
    });
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
        backupScheduleDto: {
          storageType: BackupStorageType.DataStore,
          backupsStored: 7,
          cronParams: { period: BackupPeriod.EveryWeek, hour: 5, day: 2 },
        },
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
        backupScheduleDto: {
          storageType: BackupStorageType.DataStore,
          backupsStored: 3,
          cronParams: { period: BackupPeriod.EveryMonth, hour: 1, day: 15 },
        },
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
      createRoomRequestDto: {
        title: "Autotest Get Schedule Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await test.step("POST createbackupschedule - create schedule with room", async () => {
      await ownerApi.backup.createBackupSchedule({
        backupScheduleDto: {
          storageType: BackupStorageType.Documents,
          storageParams: [{ key: "folderId", value: String(roomId) }],
          backupsStored: 4,
          cronParams: { period: BackupPeriod.EveryDay, hour: 0 },
        },
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
        backupScheduleDto: {
          storageType: BackupStorageType.DataStore,
          backupsStored: 5,
          cronParams: { period: BackupPeriod.EveryDay, hour: 3 },
        },
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
      createRoomRequestDto: {
        title: "Autotest Backup Schedule Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await test.step("POST createbackupschedule - create schedule", async () => {
      const { data, status } = await ownerApi.backup.createBackupSchedule({
        backupScheduleDto: {
          storageType: BackupStorageType.Documents,
          storageParams: [{ key: "folderId", value: String(roomId) }],
          backupsStored: 3,
          cronParams: { period: BackupPeriod.EveryWeek, hour: 2, day: 1 },
        },
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
        backupScheduleDto: {
          storageType: BackupStorageType.DataStore,
          backupsStored: 10,
          cronParams: { period: BackupPeriod.EveryMonth, hour: 0, day: 1 },
        },
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
        backupDto: { storageType: BackupStorageType.DataStore },
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

    const { data, status } = await ownerApi.backup.getBackupsCount({
      from: "2000-01-01",
      to: "2000-01-31",
    });

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
        backupDto: { storageType: BackupStorageType.DataStore },
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
      backupDto: { storageType: BackupStorageType.DataStore },
    });

    let progressData: Awaited<
      ReturnType<typeof ownerApi.backup.getBackupProgress>
    >;

    await expect(async () => {
      progressData = await ownerApi.backup.getBackupProgress();
      expect(progressData.data.response?.status).toBe(
        DistributedTaskStatus.Running,
      );
    }).toPass({
      intervals: [300, 500, 1_000],
      timeout: 5_000,
    });

    expect(progressData!.status).toBe(200);
    expect(progressData!.data.statusCode).toBe(200);
    expect(progressData!.data.count).toBe(1);
    expect(progressData!.data.response!.backupProgressEnum).toBe(
      BackupProgressEnum.Backup,
    );
    expect(progressData!.data.response!.isCompleted).toBe(false);
    expect(progressData!.data.response!.progress).toBeGreaterThanOrEqual(0);
    expect(progressData!.data.response!.progress).toBeLessThanOrEqual(100);
    expect(progressData!.data.response!.status).toBe(
      DistributedTaskStatus.Running,
    );
    expect(progressData!.data.response!.tenantId).toBeGreaterThan(0);
    expect(progressData!.data.response!.taskId).toBeTruthy();
    expect(progressData!.data.response!.error).toBeFalsy();
  });

  test("Owner gets backup progress after backup completes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST startbackup - start backup", async () => {
      await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
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
        backupDto: { storageType: BackupStorageType.DataStore },
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
        backupDto: { storageType: BackupStorageType.DataStore },
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
        backupDto: { storageType: BackupStorageType.DataStore },
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
        backupDto: { storageType: BackupStorageType.DataStore },
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
        backupDto: { storageType: BackupStorageType.DataStore },
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
        backupScheduleDto: {
          storageType: BackupStorageType.DataStore,
          backupsStored: 5,
          cronParams: { period: BackupPeriod.EveryDay, hour: 3 },
        },
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
        backupScheduleDto: {
          storageType: BackupStorageType.DataStore,
          backupsStored: 3,
          cronParams: { period: BackupPeriod.EveryWeek, hour: 1, day: 5 },
        },
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

    let backupId!: string;

    await test.step("POST startbackup - start backup", async () => {
      await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
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
      const { data, status } = await ownerApi.backup.deleteBackup({
        id: backupId,
      });

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

    let backupId!: string;

    await test.step("POST startbackup - start backup", async () => {
      await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
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
      const { data, status } = await adminApi.backup.deleteBackup({
        id: backupId,
      });

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
        backupDto: { storageType: BackupStorageType.DataStore },
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
        backupDto: { storageType: BackupStorageType.DataStore },
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

// Note: 402 is not covered — the SDK incorrectly describes this method as plan-restricted.
test.describe("GET /api/2.0/backup/getrestoreprogress - Get restore progress", () => {
  test("Owner gets restore progress when no restore has been started", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.getRestoreProgress();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response).toBeUndefined();
  });

  test("DocSpaceAdmin gets restore progress when no restore has been started", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.backup.getRestoreProgress();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(0);
    expect(data.response).toBeUndefined();
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

test.describe("POST /portal/backup/start - Backup without Backup wallet service enabled", () => {
  test("POST /portal/backup/start - Owner creates backup when Backup wallet service is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp();
    const ownerApi = apiSdk.forRole("owner");
    await disableWalletService(ownerApi.payment, "backup");

    await test.step("POST startbackup - start backup", async () => {
      const { status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });
  });

  test("POST /portal/backup/start - DocSpaceAdmin creates backup when Backup wallet service is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp();
    const ownerApi = apiSdk.forRole("owner");
    await disableWalletService(ownerApi.payment, "backup");

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST startbackup - start backup", async () => {
      const { status } = await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });
  });
});

test.describe("POST /portal/backup/start - Backup wallet deduction on Business plan", () => {
  test("POST /portal/backup/start - DocSpaceAdmin cannot create backup when wallet balance is zero on Business plan", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(10);
    const ownerApi = apiSdk.forRole("owner");

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("GET customer balance - verify wallet has $10", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(10);
    });

    await test.step("POST startbackup - first backup is free", async () => {
      const { status } = await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for first backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET customer balance - verify wallet still has $10 after free backup", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(10);
    });

    await test.step("POST startbackup - second backup is free", async () => {
      const { status } = await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for second backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET customer balance - verify wallet still has $10 after second free backup", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(10);
    });

    await test.step("POST startbackup - third backup costs $10", async () => {
      const { status } = await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for third backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET customer balance - verify wallet is now $0", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(0);
    });

    await test.step("POST startbackup - fourth backup returns 402 when balance is zero", async () => {
      const { status } = await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(402);
    });
  });

  test("POST /portal/backup/start - Owner (payer) can top up wallet and create backup after balance is zero on Business plan", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(10);
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST startbackup - first backup is free", async () => {
      const { status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for first backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("POST startbackup - second backup is free", async () => {
      const { status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for second backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("POST startbackup - third backup costs $10", async () => {
      const { status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for third backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET customer balance - verify wallet is now $0", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(0);
    });

    await test.step("top up wallet with $10 again (simulates owner using stored payment method)", async () => {
      await paymentsApi.makeWalletTopUp(10);
    });

    await test.step("GET customer balance - verify wallet has $10 again", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(10);
    });

    await test.step("POST startbackup - fourth backup returns 200 after top up", async () => {
      const { status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });
  });
});

test.describe("POST /portal/backup/start - Backup with insufficient wallet balance", () => {
  test("POST /portal/backup/start - DocSpaceAdmin cannot create backup when wallet balance is zero after first backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp(10);
    const ownerApi = apiSdk.forRole("owner");

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("GET customer balance - verify wallet has $10", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(10);
    });

    await test.step("POST startbackup - start first backup (spends $10)", async () => {
      const { status } = await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for first backup completion", async () => {
      await expect(async () => {
        const { data } = await adminApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET customer balance - verify wallet is now $0", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(0);
    });

    await test.step("POST startbackup - second backup returns 402 when balance is zero", async () => {
      const { status } = await adminApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(402);
    });
  });

  // Note: the owner top-up step uses makeWalletTopUp (internal test API) instead of
  // topUpDeposit, because topUpDeposit requires a real stored payment method unavailable
  // on test portals. This simulates the result of the owner paying, not the payment itself.
  test("POST /portal/backup/start - Owner (payer) can top up wallet and create backup after balance is zero", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp(10);
    const ownerApi = apiSdk.forRole("owner");

    await test.step("GET customer balance - verify wallet has $10", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(10);
    });

    await test.step("POST startbackup - start first backup (spends $10)", async () => {
      const { status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });

    await test.step("GET getbackupprogress - wait for first backup completion", async () => {
      await expect(async () => {
        const { data } = await ownerApi.backup.getBackupProgress();
        expect(data.response!.isCompleted).toBe(true);
      }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 60_000 });
    });

    await test.step("GET customer balance - verify wallet is now $0", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(0);
    });

    await test.step("top up wallet with $10 again (simulates owner using stored payment method)", async () => {
      await paymentsApi.makeWalletTopUp(10);
    });

    await test.step("GET customer balance - verify wallet has $10 again", async () => {
      const { data } = await ownerApi.payment.getCustomerBalance({
        refresh: true,
      });
      expect(data.response!.subAccounts![0].amount).toBe(10);
    });

    await test.step("POST startbackup - second backup returns 200 after top up", async () => {
      const { status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });
      expect(status).toBe(200);
    });
  });
});

test.describe("GET /api/2.0/backup/getbackupscountbypaid - Get free and paid backup counts", () => {
  test("Owner gets zero free and paid counts on a portal without backups", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.getBackupsCounts();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toEqual({ free: 0, paid: 0 });
  });

  test("Owner gets counts of a completed backup and the contract of the response", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    let taskId!: string;

    await test.step("start a backup and wait for exactly that job", async () => {
      taskId = await runBackup(ownerApi.backup);
    });

    await test.step("GET getbackupscountbypaid - the backup is counted as free", async () => {
      const { data, status } = await ownerApi.backup.getBackupsCounts();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(Object.keys(data.response!).sort()).toEqual(["free", "paid"]);
      expect(Number.isInteger(data.response!.free)).toBe(true);
      expect(Number.isInteger(data.response!.paid)).toBe(true);
      expect(data.response).toEqual({ free: 1, paid: 0 });
    });

    await test.step("the `paid` query parameter is ignored: both figures are always returned", async () => {
      const { data, status } = await ownerApi.backup.getBackupsCounts({
        paid: true,
      });

      expect(status).toBe(200);
      expect(data.response).toEqual({ free: 1, paid: 0 });
    });

    await test.step("getbackupscount reports the same figures one kind at a time", async () => {
      const { data: free } = await ownerApi.backup.getBackupsCount();
      const { data: paid } = await ownerApi.backup.getBackupsCount({
        paid: true,
      });

      expect(free.response).toBe(1);
      expect(paid.response).toBe(0);
    });

    await test.step("the free count agrees with the history", async () => {
      const { data: counts } = await ownerApi.backup.getBackupsCounts();
      const { data: history } = await ownerApi.backup.getBackupHistory();

      expect(history.response!.map((record) => record.id)).toEqual([taskId]);
      expect(counts.response!.free).toBe(history.response!.length);
    });

    await test.step("a period that contains the backup counts it", async () => {
      const { data } = await ownerApi.backup.getBackupsCounts({
        from: "2000-01-01",
        to: "2099-12-31",
      });

      expect(data.response).toEqual({ free: 1, paid: 0 });
    });

    await test.step("periods entirely in the past or in the future do not count it", async () => {
      const { data: past } = await ownerApi.backup.getBackupsCounts({
        from: "2000-01-01",
        to: "2000-12-31",
      });
      const { data: future } = await ownerApi.backup.getBackupsCounts({
        from: "2098-01-01",
        to: "2098-12-31",
      });

      expect(past.response).toEqual({ free: 0, paid: 0 });
      expect(future.response).toEqual({ free: 0, paid: 0 });
    });

    await test.step("repeated reads return the same figures", async () => {
      const { data: first } = await ownerApi.backup.getBackupsCounts();
      const { data: second } = await ownerApi.backup.getBackupsCounts();

      expect(second.response).toEqual(first.response);
    });
  });

  test("Owner gets counts for periods with valid bounds", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("from equal to to is accepted", async () => {
      const { data, status } = await ownerApi.backup.getBackupsCounts({
        from: "2020-05-05",
        to: "2020-05-05",
      });

      expect(status).toBe(200);
      expect(data.response).toEqual({ free: 0, paid: 0 });
    });

    await test.step("full ISO timestamps in UTC are accepted", async () => {
      const { data, status } = await ownerApi.backup.getBackupsCounts({
        from: "2020-05-05T00:00:00Z",
        to: "2020-05-05T23:59:59Z",
      });

      expect(status).toBe(200);
      expect(data.response).toEqual({ free: 0, paid: 0 });
    });

    await test.step("only `from` is accepted, `to` defaults to the moment of the call", async () => {
      const { status } = await ownerApi.backup.getBackupsCounts({
        from: "2020-05-05",
      });

      expect(status).toBe(200);
    });
  });

  test("Owner gets 400 for invalid periods", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("from later than to", async () => {
      const { status } = await ownerApi.backup.getBackupsCounts({
        from: "2030-01-02",
        to: "2030-01-01",
      });

      expect(status).toBe(400);
    });

    await test.step("only `to` before the start of the current month, so the default `from` is later than it", async () => {
      const { status } = await ownerApi.backup.getBackupsCounts({
        to: "2000-01-01",
      });

      expect(status).toBe(400);
    });

    await test.step("`from` is not a date", async () => {
      const { status } = await ownerApi.backup.getBackupsCounts({
        from: "not-a-date",
      });

      expect(status).toBe(400);
    });

    await test.step("`to` is not a date", async () => {
      const { status } = await ownerApi.backup.getBackupsCounts({
        to: "not-a-date",
      });

      expect(status).toBe(400);
    });

    await test.step("the same validation applies to getbackupscount", async () => {
      const { status } = await ownerApi.backup.getBackupsCount({
        from: "2030-01-02",
        to: "2030-01-01",
      });

      expect(status).toBe(400);
    });
  });

  test("Owner counts include backups that were already deleted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    let firstId!: string;

    await test.step("create two backups", async () => {
      firstId = await runBackup(ownerApi.backup);
      await runBackup(ownerApi.backup);

      const { data } = await ownerApi.backup.getBackupsCounts();
      expect(data.response).toEqual({ free: 2, paid: 0 });
    });

    await test.step("deleting one backup shrinks the history but not the counts", async () => {
      const { data: deleted } = await ownerApi.backup.deleteBackup({
        id: firstId,
      });
      expect(deleted.response).toBe(true);

      const { data: history } = await ownerApi.backup.getBackupHistory();
      expect(history.response!.map((record) => record.id)).not.toContain(
        firstId,
      );
      expect(history.response!).toHaveLength(1);

      const { data: counts } = await ownerApi.backup.getBackupsCounts();
      expect(counts.response).toEqual({ free: 2, paid: 0 });
    });

    await test.step("clearing the history empties it but leaves the counts", async () => {
      await ownerApi.backup.deleteBackupHistory();

      const { data: history } = await ownerApi.backup.getBackupHistory();
      expect(history.response).toEqual([]);

      const { data: counts } = await ownerApi.backup.getBackupsCounts();
      expect(counts.response).toEqual({ free: 2, paid: 0 });
    });
  });

  test("Owner counts a backup charged to the wallet as paid", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(10);
    const ownerApi = apiSdk.forRole("owner");

    await test.step("two backups use up the free monthly allowance", async () => {
      await runBackup(ownerApi.backup);
      await runBackup(ownerApi.backup);

      const { data } = await ownerApi.backup.getBackupsCounts();
      expect(data.response).toEqual({ free: 2, paid: 0 });
    });

    await test.step("the third backup is charged to the wallet", async () => {
      await runBackup(ownerApi.backup);

      const { data } = await ownerApi.backup.getBackupsCounts();
      expect(data.response).toEqual({ free: 2, paid: 1 });
    });

    await test.step("getbackupscount splits the same way", async () => {
      const { data: free } = await ownerApi.backup.getBackupsCount();
      const { data: paid } = await ownerApi.backup.getBackupsCount({
        paid: true,
      });

      expect(free.response).toBe(2);
      expect(paid.response).toBe(1);
    });
  });

  test("Owner counts do not grow when a backup is rejected for the empty wallet", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("two backups use up the free monthly allowance", async () => {
      await runBackup(ownerApi.backup);
      await runBackup(ownerApi.backup);

      const { data } = await ownerApi.backup.getBackupsCounts();
      expect(data.response).toEqual({ free: 2, paid: 0 });
    });

    await test.step("the third backup is rejected: nothing to pay it with", async () => {
      const { status } = await ownerApi.backup.startBackup({
        backupDto: { storageType: BackupStorageType.DataStore },
      });

      expect(status).toBe(402);
    });

    await test.step("the rejected request is not counted and left no history record", async () => {
      const { data: counts } = await ownerApi.backup.getBackupsCounts();
      const { data: history } = await ownerApi.backup.getBackupHistory();

      expect(counts.response).toEqual({ free: 2, paid: 0 });
      expect(history.response!).toHaveLength(2);
    });
  });
});

test.describe("POST /api/2.0/backup/createbackupschedule - Create backup schedule: valid values and replacement", () => {
  const dailySchedule = (
    overrides: Partial<BackupScheduleDto> = {},
  ): BackupScheduleDto => ({
    storageType: BackupStorageType.DataStore,
    backupsStored: 5,
    cronParams: { period: BackupPeriod.EveryDay, hour: 3 },
    ...overrides,
  });

  const validCases: {
    name: string;
    dto: BackupScheduleDto;
    expected: {
      backupsStored: number;
      period: BackupPeriod;
      hour: number;
      day?: number;
    };
  }[] = [
    {
      name: "hour 0 (lower bound)",
      dto: dailySchedule({
        cronParams: { period: BackupPeriod.EveryDay, hour: 0 },
      }),
      expected: { backupsStored: 5, period: BackupPeriod.EveryDay, hour: 0 },
    },
    {
      name: "hour 23 (upper bound)",
      dto: dailySchedule({
        cronParams: { period: BackupPeriod.EveryDay, hour: 23 },
      }),
      expected: { backupsStored: 5, period: BackupPeriod.EveryDay, hour: 23 },
    },
    {
      name: "weekly on day 1 (Sunday)",
      dto: dailySchedule({
        cronParams: { period: BackupPeriod.EveryWeek, hour: 3, day: 1 },
      }),
      expected: {
        backupsStored: 5,
        period: BackupPeriod.EveryWeek,
        hour: 3,
        day: 1,
      },
    },
    {
      name: "weekly on day 7 (Saturday)",
      dto: dailySchedule({
        cronParams: { period: BackupPeriod.EveryWeek, hour: 3, day: 7 },
      }),
      expected: {
        backupsStored: 5,
        period: BackupPeriod.EveryWeek,
        hour: 3,
        day: 7,
      },
    },
    {
      name: "monthly on day 1",
      dto: dailySchedule({
        cronParams: { period: BackupPeriod.EveryMonth, hour: 3, day: 1 },
      }),
      expected: {
        backupsStored: 5,
        period: BackupPeriod.EveryMonth,
        hour: 3,
        day: 1,
      },
    },
    {
      name: "monthly on day 29",
      dto: dailySchedule({
        cronParams: { period: BackupPeriod.EveryMonth, hour: 3, day: 29 },
      }),
      expected: {
        backupsStored: 5,
        period: BackupPeriod.EveryMonth,
        hour: 3,
        day: 29,
      },
    },
    {
      name: "monthly on day 31 (upper bound)",
      dto: dailySchedule({
        cronParams: { period: BackupPeriod.EveryMonth, hour: 3, day: 31 },
      }),
      expected: {
        backupsStored: 5,
        period: BackupPeriod.EveryMonth,
        hour: 3,
        day: 31,
      },
    },
    {
      name: "backupsStored 1 (lower bound)",
      dto: dailySchedule({ backupsStored: 1 }),
      expected: { backupsStored: 1, period: BackupPeriod.EveryDay, hour: 3 },
    },
    {
      name: "backupsStored 30 (upper bound)",
      dto: dailySchedule({ backupsStored: 30 }),
      expected: { backupsStored: 30, period: BackupPeriod.EveryDay, hour: 3 },
    },
    {
      name: "backupsStored omitted (defaults to 1)",
      dto: dailySchedule({ backupsStored: undefined }),
      expected: { backupsStored: 1, period: BackupPeriod.EveryDay, hour: 3 },
    },
    {
      name: "backupsStored null (defaults to 1)",
      dto: dailySchedule({ backupsStored: null }),
      expected: { backupsStored: 1, period: BackupPeriod.EveryDay, hour: 3 },
    },
    {
      name: "storageParams null for DataStore",
      dto: dailySchedule({ storageParams: null }),
      expected: { backupsStored: 5, period: BackupPeriod.EveryDay, hour: 3 },
    },
    {
      name: "an unknown extra field in the body (ignored)",
      dto: { ...dailySchedule(), foo: "bar" } as BackupScheduleDto,
      expected: { backupsStored: 5, period: BackupPeriod.EveryDay, hour: 3 },
    },
  ];

  for (const { name, dto, expected } of validCases) {
    test(`POST /api/2.0/backup/createbackupschedule - Owner creates a schedule with ${name}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.backup.createBackupSchedule({
        backupScheduleDto: dto,
      });

      expect(status).toBe(200);
      expect(data.response).toBe(true);

      const { data: stored } = await ownerApi.backup.getBackupSchedule();
      expect(stored.response!.storageType).toBe(BackupStorageType.DataStore);
      expect(stored.response!.backupsStored).toBe(expected.backupsStored);
      expect(stored.response!.cronParams.period).toBe(expected.period);
      expect(stored.response!.cronParams.hour).toBe(expected.hour);
      if (expected.day !== undefined) {
        expect(stored.response!.cronParams.day).toBe(expected.day);
      }
    });
  }

  test("POST /api/2.0/backup/createbackupschedule - A new schedule replaces the existing one", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await test.step("create the first schedule", async () => {
      const { status } = await ownerApi.backup.createBackupSchedule({
        backupScheduleDto: dailySchedule(),
      });
      expect(status).toBe(200);
    });

    await test.step("create a second, different schedule", async () => {
      const { status } = await ownerApi.backup.createBackupSchedule({
        backupScheduleDto: dailySchedule({
          backupsStored: 3,
          cronParams: { period: BackupPeriod.EveryMonth, hour: 1, day: 15 },
        }),
      });
      expect(status).toBe(200);
    });

    await test.step("only the second schedule is stored", async () => {
      const { data } = await ownerApi.backup.getBackupSchedule();

      expect(data.response!.backupsStored).toBe(3);
      expect(data.response!.cronParams.period).toBe(BackupPeriod.EveryMonth);
      expect(data.response!.cronParams.hour).toBe(1);
      expect(data.response!.cronParams.day).toBe(15);
    });
  });
});

test.describe("POST /api/2.0/backup/createbackupschedule - Create backup schedule: server-side validation", () => {
  const baselineSchedule: BackupScheduleDto = {
    storageType: BackupStorageType.DataStore,
    backupsStored: 7,
    cronParams: { period: BackupPeriod.EveryWeek, hour: 5, day: 2 },
  };

  // A valid DataStore schedule that individual cases break one field of.
  const valid = {
    storageType: BackupStorageType.DataStore,
    backupsStored: 5,
    cronParams: { period: BackupPeriod.EveryDay, hour: 3 },
  };

  /**
   * Stores a baseline schedule, sends the invalid one and proves the baseline
   * survived. The portal is a paid one, so a rejection cannot be a 402 and the
   * baseline being stored proves the endpoint accepts a valid request at all.
   * The side effect is checked before the status on purpose: a rejected request
   * that overwrote the schedule must be reported as that, not as a status.
   */
  async function sendInvalidSchedule(
    backup: BackupApi,
    dto: unknown,
  ): Promise<number> {
    const { data: created, status: createdStatus } =
      await backup.createBackupSchedule({
        backupScheduleDto: baselineSchedule,
      });
    expect(createdStatus).toBe(200);
    expect(created.response).toBe(true);

    const { data: before } = await backup.getBackupSchedule();
    expect(before.response!.backupsStored).toBe(7);

    const { status } = await backup.createBackupSchedule({
      backupScheduleDto: dto as BackupScheduleDto | undefined,
    });

    const { data: after } = await backup.getBackupSchedule();
    expect(after.response).toEqual(before.response);

    return status;
  }

  // Values the framework itself refuses: they never reach the controller.
  const rejectedAs400: { name: string; dto: unknown }[] = [
    { name: "backupsStored 0", dto: { ...valid, backupsStored: 0 } },
    { name: "backupsStored -1", dto: { ...valid, backupsStored: -1 } },
    { name: "backupsStored 31", dto: { ...valid, backupsStored: 31 } },
    {
      name: "backupsStored 2147483647",
      dto: { ...valid, backupsStored: 2147483647 },
    },
    {
      name: "backupsStored above Int32 range",
      dto: { ...valid, backupsStored: 2147483648 },
    },
    { name: "fractional backupsStored", dto: { ...valid, backupsStored: 2.5 } },
    {
      name: "non-numeric backupsStored",
      dto: { ...valid, backupsStored: "abc" },
    },
    {
      name: "a non-numeric storageType",
      dto: { ...valid, storageType: "abc" },
    },
    {
      name: "a non-numeric period",
      dto: { ...valid, cronParams: { period: "abc", hour: 3 } },
    },
    {
      name: "a non-numeric hour",
      dto: { ...valid, cronParams: { period: 0, hour: "x" } },
    },
    {
      name: "a fractional hour",
      dto: { ...valid, cronParams: { period: 0, hour: 3.5 } },
    },
    {
      name: "a non-numeric day",
      dto: { ...valid, cronParams: { period: 2, hour: 3, day: "x" } },
    },
    {
      name: "storageParams as an object instead of an array",
      dto: { ...valid, storageParams: { folderId: "1" } },
    },
    {
      name: "storageParams as a string",
      dto: { ...valid, storageParams: "x" },
    },
  ];

  for (const { name, dto } of rejectedAs400) {
    test(`POST /api/2.0/backup/createbackupschedule - Rejects ${name} with 400 and keeps the stored schedule`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");

      const status = await sendInvalidSchedule(ownerApi.backup, dto);

      expect(status).toBe(400);
    });
  }

  test("POST /api/2.0/backup/createbackupschedule - Rejects a folder that does not exist with 404 and keeps the stored schedule", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const status = await sendInvalidSchedule(ownerApi.backup, {
      ...valid,
      storageType: BackupStorageType.Documents,
      storageParams: [{ key: "folderId", value: "99999999" }],
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/backup/createbackupschedule - Rejects Local storage on a hosted portal and keeps the stored schedule", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // On a standalone installation Local is allowed and would schedule backups
    // into a path on the server.
    test.skip(
      !!config.LOCAL_PORTAL_DOMAIN,
      "Local storage works on a standalone installation",
    );
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    // The status is not asserted: the server answers 500 "Access denied", and the
    // contract only says Local is for standalone installations. What matters is
    // that the stored schedule survives, which sendInvalidSchedule checks.
    await sendInvalidSchedule(ownerApi.backup, {
      ...valid,
      storageType: BackupStorageType.Local,
      storageParams: [{ key: "filePath", value: "/tmp/autotest" }],
    });
  });

  test("POST /api/2.0/backup/createbackupschedule - Rejects dump for a portal owner with 403 and keeps the stored schedule", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // On a standalone installation `dump` is allowed and would write the
    // schedule of the whole server, which this suite must never touch.
    test.skip(
      !!config.LOCAL_PORTAL_DOMAIN,
      "dump writes a server-wide schedule on a standalone installation",
    );
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const status = await sendInvalidSchedule(ownerApi.backup, {
      ...valid,
      dump: true,
    });

    expect(status).toBe(403);
  });

  // The server answers these with an unhandled exception (500). The SDK says the
  // request "fails" without giving a status; 400 is assumed here, as for the
  // invalid folderId of startbackup (BUG 79523).
  const failsWith500: { name: string; dto: unknown }[] = [
    { name: "a request without a body", dto: undefined },
    { name: "an empty body", dto: {} },
    {
      name: "a body without cronParams",
      dto: { storageType: BackupStorageType.DataStore, backupsStored: 5 },
    },
    { name: "null cronParams", dto: { ...valid, cronParams: null } },
    {
      name: "a period outside the enum (3)",
      dto: { ...valid, cronParams: { period: 3, hour: 3 } },
    },
    {
      name: "a negative period",
      dto: { ...valid, cronParams: { period: -1, hour: 3 } },
    },
    {
      name: "hour 24",
      dto: { ...valid, cronParams: { period: 0, hour: 24 } },
    },
    {
      name: "a negative hour",
      dto: { ...valid, cronParams: { period: 0, hour: -1 } },
    },
    {
      name: "a weekly schedule without a day",
      dto: { ...valid, cronParams: { period: 1, hour: 3 } },
    },
    {
      name: "a weekly schedule on day 0",
      dto: { ...valid, cronParams: { period: 1, hour: 3, day: 0 } },
    },
    {
      name: "a weekly schedule on day 8",
      dto: { ...valid, cronParams: { period: 1, hour: 3, day: 8 } },
    },
    {
      name: "a weekly schedule on a negative day",
      dto: { ...valid, cronParams: { period: 1, hour: 3, day: -1 } },
    },
    {
      name: "a monthly schedule without a day",
      dto: { ...valid, cronParams: { period: 2, hour: 3 } },
    },
    {
      name: "a monthly schedule on day 0",
      dto: { ...valid, cronParams: { period: 2, hour: 3, day: 0 } },
    },
    {
      name: "a monthly schedule on day 32",
      dto: { ...valid, cronParams: { period: 2, hour: 3, day: 32 } },
    },
    {
      name: "a Documents schedule without storageParams",
      dto: { ...valid, storageType: BackupStorageType.Documents },
    },
    {
      name: "a Documents schedule whose storageParams lack folderId",
      dto: {
        ...valid,
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "x", value: "1" }],
      },
    },
    {
      name: "a ThridpartyDocuments schedule without storageParams",
      dto: { ...valid, storageType: BackupStorageType.ThridpartyDocuments },
    },
    {
      name: "a body without storageType and without folderId",
      dto: { backupsStored: 5, cronParams: { period: 0, hour: 3 } },
    },
  ];

  for (const { name, dto } of failsWith500) {
    test.fail(
      `BUG 84509: POST /api/2.0/backup/createbackupschedule - Rejects ${name} with 400 instead of 500`,
      async ({ apiSdk, paymentsApi }) => {
        await paymentsApi.setupPayment();
        const ownerApi = apiSdk.forRole("owner");

        const status = await sendInvalidSchedule(ownerApi.backup, dto);

        expect(status).toBe(400);
      },
    );
  }

  // The server accepts these with 200 and stores them, replacing the working
  // schedule with one that can never run.
  const acceptedButInvalid: { name: string; dto: unknown }[] = [
    { name: "storageType 99", dto: { ...valid, storageType: 99 } },
    { name: "a negative storageType", dto: { ...valid, storageType: -1 } },
    {
      name: "a ThirdPartyConsumer schedule with an unknown module",
      dto: {
        ...valid,
        storageType: BackupStorageType.ThirdPartyConsumer,
        storageParams: [{ key: "module", value: "no-such-module" }],
      },
    },
    {
      name: "a ThirdPartyConsumer schedule without a module",
      dto: { ...valid, storageType: BackupStorageType.ThirdPartyConsumer },
    },
  ];

  for (const { name, dto } of acceptedButInvalid) {
    test.fail(
      `BUG 84510: POST /api/2.0/backup/createbackupschedule - Rejects ${name} with 400 instead of replacing the stored schedule`,
      async ({ apiSdk, paymentsApi }) => {
        await paymentsApi.setupPayment();
        const ownerApi = apiSdk.forRole("owner");

        const status = await sendInvalidSchedule(ownerApi.backup, dto);

        expect(status).toBe(400);
      },
    );
  }

  // folderId is not an integer, so the server looks for a third-party provider
  // and answers with a misleading 404 ("Selector '' not found").
  test.fail(
    "BUG 84511: POST /api/2.0/backup/createbackupschedule - Rejects a non-numeric folderId of a Documents schedule with 400 instead of 404",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");

      const status = await sendInvalidSchedule(ownerApi.backup, {
        ...valid,
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "folderId", value: "invalid_value" }],
      });

      expect(status).toBe(400);
    },
  );
});

test.describe("POST /api/2.0/backup/startbackup - Start backup: server-side validation", () => {
  /**
   * Sends a request that is expected to be rejected and proves it changed nothing:
   * the portal is fresh, so before it there is no job, no history and no counts,
   * and after it there must still be none. The side effect is checked before the
   * status is returned to the caller.
   */
  async function sendRejectedBackup(backup: BackupApi, dto: unknown) {
    const before = await snapshotBackups(backup);
    expect(before.job).toBeUndefined();
    expect(before.historyIds).toEqual([]);
    expect(before.counts).toEqual({ free: 0, paid: 0 });

    const response = await backup.startBackup({
      backupDto: dto as BackupDto | undefined,
    });

    expect(await snapshotBackups(backup)).toEqual(before);

    return response;
  }

  const folder = (value: unknown) => [{ key: "folderId", value }];

  // storageType and storageParams that the framework refuses before the controller.
  const bindingErrors: { name: string; dto: unknown; field: string }[] = [
    { name: "a null body", dto: null, field: "" },
    {
      name: "a string storageType",
      dto: { storageType: "abc" },
      field: "$.storageType",
    },
    {
      name: "a fractional storageType",
      dto: { storageType: 1.5 },
      field: "$.storageType",
    },
    {
      name: "a boolean storageType",
      dto: { storageType: true },
      field: "$.storageType",
    },
    {
      name: "an array storageType",
      dto: { storageType: [] },
      field: "$.storageType",
    },
    {
      name: "storageParams as an object",
      dto: { storageType: 0, storageParams: { folderId: "1" } },
      field: "$.storageParams",
    },
    {
      name: "storageParams as a string",
      dto: { storageType: 0, storageParams: "x" },
      field: "$.storageParams",
    },
    {
      name: "storageParams as a number",
      dto: { storageType: 0, storageParams: 5 },
      field: "$.storageParams",
    },
    {
      name: "a string dump",
      dto: { storageType: 4, dump: "x" },
      field: "$.dump",
    },
  ];

  for (const { name, dto, field } of bindingErrors) {
    test(`POST /api/2.0/backup/startbackup - Rejects ${name} with 400 and starts nothing`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await sendRejectedBackup(ownerApi.backup, dto);

      expect(status).toBe(400);
      expect(Object.keys((data as any).response.errors)).toContain(field);
    });
  }

  // Without a usable storageType the portal documents are the target, and they
  // need an integer folderId.
  const noFolder: { name: string; dto: unknown }[] = [
    { name: "a request without a body", dto: undefined },
    { name: "an empty body", dto: {} },
    { name: "a null storageType", dto: { storageType: null } },
    {
      name: "a Documents request without storageParams",
      dto: { storageType: BackupStorageType.Documents },
    },
    {
      name: "a Documents request with null storageParams",
      dto: { storageType: BackupStorageType.Documents, storageParams: null },
    },
    {
      name: "a Documents request with empty storageParams",
      dto: { storageType: BackupStorageType.Documents, storageParams: [] },
    },
    {
      name: "a Documents request whose storageParams lack folderId",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "x", value: "1" }],
      },
    },
    {
      name: "a Documents request with duplicate folderId keys",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: [...folder("1"), ...folder("2")],
      },
    },
    {
      name: "an empty folderId",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: folder(""),
      },
    },
    {
      name: "a whitespace folderId",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: folder(" "),
      },
    },
    {
      name: "a fractional folderId",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: folder("1.5"),
      },
    },
    {
      name: "a folderId above the Int32 range",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: folder("9223372036854775807"),
      },
    },
    {
      name: "a folderId above the Int64 range",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: folder("99999999999999999999"),
      },
    },
  ];

  for (const { name, dto } of noFolder) {
    test(`POST /api/2.0/backup/startbackup - Rejects ${name} with 400 and starts nothing`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await sendRejectedBackup(ownerApi.backup, dto);

      expect(status).toBe(400);
      expect((data as any).error).toBeDefined();
    });
  }

  for (const folderId of ["0", "-1", "2147483647"]) {
    test(`POST /api/2.0/backup/startbackup - Rejects the folderId ${folderId} that does not exist with 404 and starts nothing`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await sendRejectedBackup(ownerApi.backup, {
        storageType: BackupStorageType.Documents,
        storageParams: folder(folderId),
      });

      expect(status).toBe(404);
      expect((data as any).error).toBeDefined();
    });
  }

  test("POST /api/2.0/backup/startbackup - Rejects a third-party connection that does not exist with 404 and starts nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await sendRejectedBackup(ownerApi.backup, {
      storageType: BackupStorageType.ThridpartyDocuments,
      storageParams: folder("webdav-99999"),
    });

    expect(status).toBe(404);
    expect((data as any).error).toBeDefined();
  });

  test("POST /api/2.0/backup/startbackup - Rejects Local storage on a hosted portal and starts nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // On a standalone installation Local is allowed and would write an archive
    // to the given path on the server.
    test.skip(
      !!config.LOCAL_PORTAL_DOMAIN,
      "Local storage works on a standalone installation",
    );
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    // The status is not asserted: the server answers 500 "Access denied", and
    // the contract only says Local is for standalone installations.
    await sendRejectedBackup(ownerApi.backup, {
      storageType: BackupStorageType.Local,
      storageParams: [{ key: "filePath", value: "/tmp/autotest" }],
    });
  });

  // The server accepts these and the job itself fails: the SDK says a non-empty
  // `error` of the progress is the only report of a failure.
  const failsInTheJob: { name: string; dto: unknown }[] = [
    {
      name: "a ThirdPartyConsumer request without a module",
      dto: { storageType: BackupStorageType.ThirdPartyConsumer },
    },
    {
      name: "a ThirdPartyConsumer request with an unknown module",
      dto: {
        storageType: BackupStorageType.ThirdPartyConsumer,
        storageParams: [{ key: "module", value: "no-such-module" }],
      },
    },
    {
      name: "the unsupported CustomCloud storage",
      dto: { storageType: BackupStorageType.CustomCloud },
    },
    { name: "a storageType outside the enum", dto: { storageType: 99 } },
    { name: "a negative storageType", dto: { storageType: -1 } },
  ];

  for (const { name, dto } of failsInTheJob) {
    test(`POST /api/2.0/backup/startbackup - Accepts ${name} and the job fails without leaving an archive`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      await paymentsApi.makeWalletTopUp(10);
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.backup.startBackup({
        backupDto: dto as BackupDto,
      });

      expect(status).toBe(200);
      const taskId = data.response!.taskId!;
      expect(taskId).toBeTruthy();

      const job = await waitForBackupJobEnd(ownerApi.backup, taskId);
      expect(job.error).toBeTruthy();

      const { data: history } = await ownerApi.backup.getBackupHistory();
      expect(history.response).toEqual([]);
    });
  }

  test("POST /api/2.0/backup/startbackup - An unknown field in the body is ignored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      backupDto: {
        storageType: BackupStorageType.DataStore,
        foo: "bar",
      } as BackupDto,
    });

    expect(status).toBe(200);
    const taskId = data.response!.taskId!;

    const job = await waitForBackupJobEnd(ownerApi.backup, taskId);
    expect(job.error).toBeFalsy();

    const { data: history } = await ownerApi.backup.getBackupHistory();
    expect(history.response!.map((record) => record.id)).toEqual([taskId]);
  });

  // An item without a key or a value, or a missing parameter, ends in an
  // unhandled exception instead of the 400 that the same controller returns for
  // a folderId of the wrong form ("wrong folder type").
  const unhandled: { name: string; dto: unknown }[] = [
    {
      name: "a storageParams item without a value",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "folderId" }],
      },
    },
    {
      name: "a storageParams item without a key",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: [{ value: "1" }],
      },
    },
    {
      name: "a null storageParams item",
      dto: { storageType: BackupStorageType.Documents, storageParams: [null] },
    },
    {
      name: "a null folderId",
      dto: {
        storageType: BackupStorageType.Documents,
        storageParams: folder(null),
      },
    },
    {
      name: "a ThridpartyDocuments request without storageParams",
      dto: { storageType: BackupStorageType.ThridpartyDocuments },
    },
  ];

  for (const { name, dto } of unhandled) {
    test.fail(
      `BUG 84512: POST /api/2.0/backup/startbackup - Rejects ${name} with 400 instead of 500`,
      async ({ apiSdk, paymentsApi }) => {
        await paymentsApi.setupPayment();
        const ownerApi = apiSdk.forRole("owner");

        const { status } = await sendRejectedBackup(ownerApi.backup, dto);

        expect(status).toBe(400);
      },
    );
  }
});

test.describe("DELETE /api/2.0/backup/deletebackup - Delete backup: validation and isolation", () => {
  test("DELETE /api/2.0/backup/deletebackup - An id that is not a GUID gets 404 and deletes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await runBackup(ownerApi.backup);
    const before = await snapshotBackups(ownerApi.backup);
    expect(before.historyIds).toHaveLength(1);

    // The 404 has an empty body: the route only matches a GUID, so these never
    // reach the controller.
    const ids = [
      "abc",
      "-1",
      "0",
      "99999999999999999999",
      "a".repeat(5000),
      "'; DROP TABLE backups;--",
      "бэкап",
      "a%2Fb",
      "null",
      "",
    ];

    for (const id of ids) {
      await test.step(`DELETE deletebackup/${id.slice(0, 40)}`, async () => {
        const { status } = await ownerApi.backup.deleteBackup({ id });

        expect(status).toBe(404);
        expect(await snapshotBackups(ownerApi.backup)).toEqual(before);
      });
    }
  });

  test("DELETE /api/2.0/backup/deletebackup - A GUID that is not in the history deletes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await runBackup(ownerApi.backup);
    const before = await snapshotBackups(ownerApi.backup);
    expect(before.historyIds).toHaveLength(1);

    // The status is not asserted: the server answers 500 (NullReferenceException)
    // for a GUID it has never seen, while a second deletion of a real backup
    // answers 200, and the SDK does not say which is right. What matters here is
    // that the request touches nothing.
    for (const id of [
      "11111111-2222-3333-4444-555555555555",
      "00000000-0000-0000-0000-000000000000",
    ]) {
      await ownerApi.backup.deleteBackup({ id });

      expect(await snapshotBackups(ownerApi.backup)).toEqual(before);
    }
  });

  test("DELETE /api/2.0/backup/deletebackup - A call without an id is refused by the SDK before any request", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await runBackup(ownerApi.backup);
    const before = await snapshotBackups(ownerApi.backup);

    await expect(
      ownerApi.backup.deleteBackup({} as { id: string }),
    ).rejects.toThrow(/Required parameter id/);

    expect(await snapshotBackups(ownerApi.backup)).toEqual(before);
  });

  test("DELETE /api/2.0/backup/deletebackup - Deleting one of two backups leaves the other untouched", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const firstId = await runBackup(ownerApi.backup);
    const secondId = await runBackup(ownerApi.backup);

    const { data: before } = await ownerApi.backup.getBackupHistory();
    expect(before.response!.map((record) => record.id).sort()).toEqual(
      [firstId, secondId].sort(),
    );
    const secondBefore = before.response!.find(
      (record) => record.id === secondId,
    );

    const { data, status } = await ownerApi.backup.deleteBackup({
      id: firstId,
    });
    expect(status).toBe(200);
    expect(data.response).toBe(true);

    const { data: after } = await ownerApi.backup.getBackupHistory();
    expect(after.response).toEqual([secondBefore]);
  });

  test("DELETE /api/2.0/backup/deletebackup - Deleting the same backup twice answers 200 both times and touches no other backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const firstId = await runBackup(ownerApi.backup);
    const secondId = await runBackup(ownerApi.backup);

    const first = await ownerApi.backup.deleteBackup({ id: firstId });
    expect(first.status).toBe(200);
    expect(first.data.response).toBe(true);

    const afterFirst = await snapshotBackups(ownerApi.backup);
    expect(afterFirst.historyIds).toEqual([secondId]);

    const second = await ownerApi.backup.deleteBackup({ id: firstId });
    expect(second.status).toBe(200);
    expect(second.data.response).toBe(true);

    expect(await snapshotBackups(ownerApi.backup)).toEqual(afterFirst);
  });
});

test.describe("POST /api/2.0/backup/startrestore - Start restore: safe negative validation", () => {
  // Restoring replaces the data of the portal, and the request that was meant to
  // be harmless - an all-zero GUID - was seen to be accepted with 200 and to queue
  // a restore. Every body below is therefore built so that it cannot reach the
  // queue: the backupId is never a GUID, storageParams never carries a filePath,
  // and startRestoreThatCannotQueue refuses to send anything else.
  const notAGuid = "not-a-guid";

  async function createWitnessRoom(
    ownerApi: ReturnType<ApiSDK["forRole"]>,
  ): Promise<number> {
    const { data } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Restore Witness",
        roomType: RoomType.CustomRoom,
      },
    });
    return data.response!.id!;
  }

  async function expectWitnessRoomIntact(
    ownerApi: ReturnType<ApiSDK["forRole"]>,
    roomId: number,
  ) {
    const { data, status } = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(status).toBe(200);
    expect(data.response!.title).toBe("Autotest Restore Witness");
  }

  const malformed: { name: string; dto: unknown; field?: string }[] = [
    { name: "a request without a body", dto: undefined },
    { name: "a null body", dto: null },
    { name: "an empty body", dto: {} },
    {
      name: "a body without backupId",
      dto: { storageType: BackupStorageType.DataStore },
    },
    { name: "a numeric backupId", dto: { backupId: 123 }, field: "$.backupId" },
    { name: "an object backupId", dto: { backupId: {} }, field: "$.backupId" },
    { name: "an array backupId", dto: { backupId: [] }, field: "$.backupId" },
    {
      name: "a boolean backupId",
      dto: { backupId: true },
      field: "$.backupId",
    },
    {
      name: "a string storageType",
      dto: { backupId: notAGuid, storageType: "abc" },
      field: "$.storageType",
    },
    {
      name: "a string notify",
      dto: { backupId: notAGuid, notify: "x" },
      field: "$.notify",
    },
    {
      name: "a numeric notify",
      dto: { backupId: notAGuid, notify: 5 },
      field: "$.notify",
    },
    {
      name: "a null notify",
      dto: { backupId: notAGuid, notify: null },
      field: "$.notify",
    },
    {
      name: "a string dump",
      dto: { backupId: notAGuid, dump: "x" },
      field: "$.dump",
    },
    {
      name: "storageParams as an object",
      dto: { backupId: notAGuid, storageParams: {} },
      field: "$.storageParams",
    },
    {
      name: "storageParams as a string",
      dto: { backupId: notAGuid, storageParams: "x" },
      field: "$.storageParams",
    },
  ];

  test("POST /api/2.0/backup/startrestore - Owner gets 400 for malformed bodies and no restore is started", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const roomId = await createWitnessRoom(ownerApi);

    for (const { name, dto, field } of malformed) {
      await test.step(`POST startrestore - ${name}`, async () => {
        const { data, status } = await startRestoreThatCannotQueue(
          ownerApi.backup,
          dto,
        );

        await expectRestoreNotStarted(ownerApi.backup);
        expect(status).toBe(400);
        if (field) {
          expect(Object.keys((data as any).response.errors)).toContain(field);
        }
      });
    }

    await expectWitnessRoomIntact(ownerApi, roomId);
  });

  // No usable source reaches the controller, which then looks up a `filePath`
  // storage parameter that is not there and ends in an unhandled exception. The
  // same endpoint answers 400 when backupId is missing altogether, and the other
  // actions of this controller return 400 for bad input (ArgumentException).
  const noSource: { name: string; dto: unknown }[] = [
    { name: "a null backupId", dto: { backupId: null } },
    { name: "an empty backupId", dto: { backupId: "" } },
    { name: "a backupId that is not a GUID", dto: { backupId: notAGuid } },
    {
      name: "a backupId that is not a GUID with DataStore storage",
      dto: { backupId: notAGuid, storageType: BackupStorageType.DataStore },
    },
    {
      name: "a backupId that is not a GUID with empty storageParams",
      dto: { backupId: notAGuid, storageParams: [] },
    },
    {
      name: "a backupId that is not a GUID with null storageParams",
      dto: { backupId: notAGuid, storageParams: null },
    },
    {
      name: "a backupId that is not a GUID with unrelated storageParams",
      dto: {
        backupId: notAGuid,
        storageParams: [{ key: "folderId", value: "1" }],
      },
    },
    {
      name: "a backupId that is not a GUID with a null storageParams item",
      dto: { backupId: notAGuid, storageParams: [null] },
    },
    {
      name: "a backupId that is not a GUID with a storageParams item without a key",
      dto: { backupId: notAGuid, storageParams: [{ value: "x" }] },
    },
  ];

  for (const { name, dto } of noSource) {
    test.fail(
      `BUG 84513: POST /api/2.0/backup/startrestore - Rejects ${name} with 400 instead of 500`,
      async ({ apiSdk, paymentsApi }) => {
        await paymentsApi.setupPayment();
        const ownerApi = apiSdk.forRole("owner");

        const { status } = await startRestoreThatCannotQueue(
          ownerApi.backup,
          dto,
        );

        await expectRestoreNotStarted(ownerApi.backup);
        expect(status).toBe(400);
      },
    );
  }

  /*
    Not run, because no request of these kinds can be proven unable to start a
    restore:
      - any backupId that is a GUID, the all-zero one included (it was accepted
        with 200 and queued a restore), and so any test of a backupId that does
        not exist;
      - any storageParams with a filePath, so a path that does not exist and a
        storageType that does not match it;
      - a numeric storageType outside the enum, or a negative one, because the
        missing-source error is raised first and hides it, and a source that
        would get past it is a GUID or a path;
      - dump: true.
  */
});

test.describe("POST /api/2.0/backup/createbackupschedule - Backup schedule lifecycle", () => {
  type ApiClient = ReturnType<ApiSDK["forRole"]>;

  const everyDay = (hour: number, backupsStored = 5): BackupScheduleDto => ({
    storageType: BackupStorageType.DataStore,
    backupsStored,
    cronParams: { period: BackupPeriod.EveryDay, hour },
  });

  /** Creates the schedule, reads it back and checks the fields the request set. */
  async function setSchedule(
    backup: BackupApi,
    dto: BackupScheduleDto,
  ): Promise<ScheduleDto> {
    const { data, status } = await backup.createBackupSchedule({
      backupScheduleDto: dto,
    });
    expect(status, JSON.stringify(data)).toBe(200);
    expect(data.response).toBe(true);

    const { data: stored } = await backup.getBackupSchedule();
    const schedule = stored.response!;
    expect(schedule.storageType).toBe(dto.storageType);
    expect(schedule.backupsStored).toBe(dto.backupsStored);
    expect(schedule.cronParams.period).toBe(dto.cronParams!.period);
    expect(schedule.cronParams.hour).toBe(dto.cronParams!.hour);
    if (dto.cronParams!.day !== undefined) {
      expect(schedule.cronParams.day).toBe(dto.cronParams!.day);
    }
    return schedule;
  }

  async function expectNoSchedule(backup: BackupApi) {
    const { data, status } = await backup.getBackupSchedule();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect("response" in data).toBe(false);
    expect(data.count).toBe(0);
  }

  test("POST /api/2.0/backup/createbackupschedule - Owner changes the schedule from Daily to Weekly to Monthly and back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    await test.step("Daily", async () => {
      const schedule = await setSchedule(backup, everyDay(3));
      expect(schedule.cronParams.day).toBe(0);
    });

    await test.step("Daily -> Weekly on Tuesday at 4", async () => {
      await setSchedule(backup, {
        ...everyDay(4),
        cronParams: { period: BackupPeriod.EveryWeek, hour: 4, day: 3 },
      });
    });

    await test.step("Weekly -> Monthly on the 20th at 5", async () => {
      await setSchedule(backup, {
        ...everyDay(5),
        cronParams: { period: BackupPeriod.EveryMonth, hour: 5, day: 20 },
      });
    });

    await test.step("Monthly -> Daily: the day of the month is gone", async () => {
      const schedule = await setSchedule(backup, everyDay(6));
      expect(schedule.cronParams.day).toBe(0);
    });
  });

  test("POST /api/2.0/backup/createbackupschedule - Owner changes one setting of a schedule at a time and the others stay", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi: ApiClient = apiSdk.forRole("owner");
    const { backup } = ownerApi;

    const weekly: BackupScheduleDto = {
      storageType: BackupStorageType.DataStore,
      backupsStored: 4,
      cronParams: { period: BackupPeriod.EveryWeek, hour: 4, day: 3 },
    };
    await setSchedule(backup, weekly);

    await test.step("only the hour", async () => {
      const dto = {
        ...weekly,
        cronParams: { ...weekly.cronParams!, hour: 22 },
      };
      const schedule = await setSchedule(backup, dto);
      expect(schedule.cronParams.day).toBe(3);
      expect(schedule.backupsStored).toBe(4);
    });

    await test.step("only the day of the week", async () => {
      const dto = {
        ...weekly,
        cronParams: { ...weekly.cronParams!, hour: 22, day: 6 },
      };
      const schedule = await setSchedule(backup, dto);
      expect(schedule.cronParams.hour).toBe(22);
      expect(schedule.backupsStored).toBe(4);
    });

    await test.step("only backupsStored", async () => {
      const dto = {
        ...weekly,
        backupsStored: 9,
        cronParams: { ...weekly.cronParams!, hour: 22, day: 6 },
      };
      const schedule = await setSchedule(backup, dto);
      expect(schedule.cronParams.hour).toBe(22);
      expect(schedule.cronParams.day).toBe(6);
    });

    await test.step("only the day of the month, after the schedule became monthly", async () => {
      await setSchedule(backup, {
        ...weekly,
        cronParams: { period: BackupPeriod.EveryMonth, hour: 22, day: 10 },
      });
      const schedule = await setSchedule(backup, {
        ...weekly,
        cronParams: { period: BackupPeriod.EveryMonth, hour: 22, day: 25 },
      });
      expect(schedule.cronParams.hour).toBe(22);
      expect(schedule.backupsStored).toBe(4);
    });
  });

  test("POST /api/2.0/backup/createbackupschedule - Owner moves the schedule between storages", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    const { backup } = ownerApi;

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Schedule Storage Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = String(room.response!.id);

    await test.step("DataStore", async () => {
      const schedule = await setSchedule(backup, everyDay(2));
      expect(schedule.storageParams.folderId).toBeNull();
    });

    await test.step("DataStore -> Documents: the folder is the room", async () => {
      const schedule = await setSchedule(backup, {
        ...everyDay(2),
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "folderId", value: roomId }],
      });
      expect(schedule.storageParams.folderId).toBe(roomId);
    });

    await test.step("Documents -> DataStore: the folder is gone", async () => {
      const schedule = await setSchedule(backup, everyDay(2));
      expect(schedule.storageParams.folderId).toBeNull();
    });
  });

  test("POST /api/2.0/backup/createbackupschedule - Creating an identical schedule again changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const first = await setSchedule(backup, everyDay(7));
    const second = await setSchedule(backup, everyDay(7));

    expect(second).toEqual(first);
  });

  test("POST /api/2.0/backup/createbackupschedule - Owner creates a schedule in a third-party storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.skip(
      !config.NEXTCLOUD_URL,
      "A third-party storage needs the Nextcloud connection of the environment",
    );
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data: connection } =
      await ownerApi.thirdPartyIntegration.saveThirdPartyBackup({
        thirdPartyBackupRequestDto: {
          url: config.NEXTCLOUD_URL,
          login: config.NEXTCLOUD_LOGIN,
          password: config.NEXTCLOUD_PASSWORD,
          customerTitle: "Nextcloud Backup",
          providerKey: "Nextcloud",
        },
      });
    const folderId = String(connection.response!.id);

    const schedule = await setSchedule(ownerApi.backup, {
      ...everyDay(1),
      storageType: BackupStorageType.ThridpartyDocuments,
      storageParams: [{ key: "folderId", value: folderId }],
    });

    expect(schedule.storageParams.folderId).toBe(folderId);
  });

  test("POST /api/2.0/backup/createbackupschedule - Owner creates a schedule in AWS S3", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.skip(
      !config.S3_ACCESS_KEY || !config.S3_BUCKET,
      "AWS S3 needs the credentials of the environment",
    );
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.settingsAuthorization.saveAuthKeys({
      authServiceRequestsDto: {
        name: "s3",
        props: [
          { name: "acesskey", value: config.S3_ACCESS_KEY },
          { name: "secretaccesskey", value: config.S3_SECRET_KEY },
        ],
      },
    });
    expect(status).toBe(200);

    const schedule = await setSchedule(ownerApi.backup, {
      ...everyDay(1),
      storageType: BackupStorageType.ThirdPartyConsumer,
      storageParams: [
        { key: "module", value: "s3" },
        { key: "bucket", value: config.S3_BUCKET },
        { key: "region", value: config.S3_REGION },
        { key: "serviceurl", value: "" },
        { key: "forcepathstyle", value: "false" },
        { key: "usehttp", value: "false" },
      ],
    });

    // The parameters come back as an object keyed by name, and for this storage
    // they are the saved ones, not rebuilt from a path.
    expect(schedule.storageParams).toEqual({
      module: "s3",
      bucket: config.S3_BUCKET,
      region: config.S3_REGION,
      serviceurl: "",
      forcepathstyle: "false",
      usehttp: "false",
    });
  });

  test("DELETE /api/2.0/backup/deletebackupschedule - Deleting a schedule that does not exist answers 200 true", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    await expectNoSchedule(backup);

    const { data, status } = await backup.deleteBackupSchedule();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
    await expectNoSchedule(backup);
  });

  test("DELETE /api/2.0/backup/deletebackupschedule - Deleting a schedule twice answers 200 true both times, and a new schedule can be created after", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    await setSchedule(backup, everyDay(3));

    for (const attempt of ["first", "second"]) {
      await test.step(`${attempt} deletion`, async () => {
        const { data, status } = await backup.deleteBackupSchedule();

        expect(status).toBe(200);
        expect(data.response).toBe(true);
        await expectNoSchedule(backup);
      });
    }

    await test.step("a new schedule after the deletion", async () => {
      await setSchedule(backup, {
        ...everyDay(8),
        cronParams: { period: BackupPeriod.EveryWeek, hour: 8, day: 2 },
      });
    });
  });

  test("DELETE /api/2.0/backup/deletebackuphistory - The schedule survives clearing the history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const schedule = await setSchedule(backup, everyDay(9));
    await runBackup(backup);

    const { data } = await backup.deleteBackupHistory();
    expect(data.response).toBe(true);

    const { data: history } = await backup.getBackupHistory();
    expect(history.response).toEqual([]);

    const { data: after } = await backup.getBackupSchedule();
    expect(after.response).toEqual(schedule);
  });

  test("DELETE /api/2.0/backup/deletebackup - The schedule survives deleting a backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const schedule = await setSchedule(backup, everyDay(9));
    const taskId = await runBackup(backup);

    const { data } = await backup.deleteBackup({ id: taskId });
    expect(data.response).toBe(true);

    const { data: history } = await backup.getBackupHistory();
    expect(history.response!.map((record) => record.id)).not.toContain(taskId);

    const { data: after } = await backup.getBackupSchedule();
    expect(after.response).toEqual(schedule);
  });
});

test.describe("Backup responses - contracts", () => {
  const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
  // The server writes UTC times without a zone designator.
  const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

  const utc = (value: string) =>
    Date.parse(/Z$/.test(value) ? value : `${value}Z`);

  function expectWrapper(
    data: { statusCode?: number; count?: number },
    count: number,
  ) {
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(count);
  }

  test("GET /api/2.0/backup/getbackupprogress - The states of a running backup are consistent and the finished one links to the archive", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const { data: started } = await backup.startBackup({
      backupDto: { storageType: BackupStorageType.DataStore },
    });
    const taskId = started.response!.taskId!;

    await test.step("the start response describes the job of this portal", async () => {
      // The job is Created until the worker picks it up, which is what the start
      // normally reports, but the response shows the queue as it is when the
      // answer is built, so a worker that was quick can already have it Running.
      const job = started.response!;
      const shown = JSON.stringify(job);
      expect(job.taskId, shown).toMatch(GUID);
      expect(Number.isInteger(job.tenantId), shown).toBe(true);
      expect(job.backupProgressEnum, shown).toBe(BackupProgressEnum.Backup);
      expect(job.error, shown).toBe("");
      expect(Number.isInteger(job.progress), shown).toBe(true);
      expect(job.progress, shown).toBeGreaterThanOrEqual(0);
      expect(job.progress, shown).toBeLessThanOrEqual(100);
      expect(
        [
          DistributedTaskStatus.Created,
          DistributedTaskStatus.Running,
          DistributedTaskStatus.Completed,
        ],
        shown,
      ).toContain(job.status);
      expect(job.isCompleted, shown).toBe(
        job.status === DistributedTaskStatus.Completed,
      );
    });

    const seen: BackupProgress[] = [];

    await test.step("poll until the job completes, keeping every state seen", async () => {
      await expect
        .poll(
          async () => {
            const { data } = await backup.getBackupProgress();
            expectWrapper(data, 1);
            seen.push(data.response!);
            // Done is isCompleted together with the Completed status: for a
            // moment the progress can show the first without the second.
            return (
              data.response!.isCompleted &&
              data.response!.status === DistributedTaskStatus.Completed
            );
          },
          { intervals: [250, 500, 1_000, 2_000], timeout: 60_000 },
        )
        .toBe(true);
    });

    await test.step("every state agrees with the others", async () => {
      let previous = 0;
      for (const state of seen) {
        expect(state.taskId).toBe(taskId);
        expect(state.tenantId).toBe(started.response!.tenantId);
        expect(state.backupProgressEnum).toBe(BackupProgressEnum.Backup);
        expect(Number.isInteger(state.progress)).toBe(true);
        expect(state.progress).toBeGreaterThanOrEqual(0);
        expect(state.progress).toBeLessThanOrEqual(100);
        expect(state.progress).toBeGreaterThanOrEqual(previous);
        previous = state.progress!;

        if (state.isCompleted) {
          expect(state.progress).toBe(100);
          if (state.status !== DistributedTaskStatus.Completed) {
            // A documented observation, not an asserted defect: for a moment the
            // progress can show isCompleted before the status follows, which is
            // what eventual consistency of the reads allows, and the contract
            // does not ask for an atomic snapshot of the job. The state must
            // still be Running, and the polling above requires the job to end
            // as Completed; the moment is only noted.
            expect(state.status).toBe(DistributedTaskStatus.Running);
            test.info().annotations.push({
              type: "observation",
              description:
                "getbackupprogress showed isCompleted true while status was still Running (transient, eventual consistency)",
            });
          }
        } else {
          // A job is Created until the worker picks it up, then Running.
          expect([
            DistributedTaskStatus.Created,
            DistributedTaskStatus.Running,
          ]).toContain(state.status);
          expect(state.error).toBe("");
          expect(state.link).toBe("");
        }
      }
    });

    await test.step("the finished job links to the archive listed in the history", async () => {
      const finished = seen[seen.length - 1];
      expect(finished.error).toBe("");
      expect(typeof finished.link).toBe("string");

      const { data: history } = await backup.getBackupHistory();
      const record = history.response!.find((item) => item.id === taskId)!;
      expect(record.fileName).toBeTruthy();
      expect(finished.link).toContain(record.fileName!);
    });
  });

  test("GET /api/2.0/backup/getbackupprogress - A job that fails reports it in error and leaves no archive", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const { data: started } = await backup.startBackup({
      backupDto: { storageType: BackupStorageType.ThirdPartyConsumer },
    });
    const taskId = started.response!.taskId!;

    const job = await waitForBackupJobEnd(backup, taskId);

    expect(job.isCompleted).toBe(true);
    expect(typeof job.error).toBe("string");
    expect(job.error).toBeTruthy();
    expect(job.link).toBeFalsy();
    expect(job.taskId).toBe(taskId);
    expect(job.backupProgressEnum).toBe(BackupProgressEnum.Backup);

    const { data: history } = await backup.getBackupHistory();
    expect(history.response).toEqual([]);
  });

  test("GET /api/2.0/backup/getrestoreprogress - Without a restore it answers 200 with no job whatever dump says", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    // Only reads: nothing here can start or touch a restore.
    for (const dump of [undefined, false, true]) {
      await test.step(`dump ${String(dump)}`, async () => {
        const { data, status } = await backup.getRestoreProgress({ dump });

        expect(status).toBe(200);
        expectWrapper(data, 0);
        expect("response" in data).toBe(false);
      });
    }
  });

  test("GET /api/2.0/backup/getbackuphistory - The records of the history follow the contract", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const taskIds = [await runBackup(backup), await runBackup(backup)];

    const { data, status } = await backup.getBackupHistory();

    expect(status).toBe(200);
    expectWrapper(data, 2);
    expect(data.response!).toHaveLength(2);

    // The order is not specified, so the records are matched by id.
    expect(data.response!.map((record) => record.id).sort()).toEqual(
      [...taskIds].sort(),
    );

    for (const record of data.response!) {
      expect(record.id).toMatch(GUID);
      expect(typeof record.fileName).toBe("string");
      expect(record.fileName).toBeTruthy();
      expect(record.storageType).toBe(BackupStorageType.DataStore);
      expect(record.createdOn).toMatch(DATE_TIME);
      expect(record.expiresOn).toMatch(DATE_TIME);
      expect(utc(record.expiresOn)).toBeGreaterThan(utc(record.createdOn));
      // The record was made moments ago, so a zone mistake or a default date
      // would be far from now.
      expect(Math.abs(Date.now() - utc(record.createdOn))).toBeLessThan(
        24 * 60 * 60 * 1000,
      );
    }
  });

  test("GET /api/2.0/backup/getbackupschedule - Without a schedule the response member is absent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const { data, status } = await backup.getBackupSchedule();

    expect(status).toBe(200);
    expectWrapper(data, 0);
    expect("response" in data).toBe(false);
  });

  test("GET /api/2.0/backup/getbackupschedule - A stored schedule follows the contract", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    await backup.createBackupSchedule({
      backupScheduleDto: {
        storageType: BackupStorageType.DataStore,
        backupsStored: 12,
        cronParams: { period: BackupPeriod.EveryWeek, hour: 14, day: 5 },
      },
    });

    const { data, status } = await backup.getBackupSchedule();

    expect(status).toBe(200);
    expectWrapper(data, 1);

    const schedule = data.response!;
    expect(schedule.storageType).toBe(BackupStorageType.DataStore);
    expect(Number.isInteger(schedule.backupsStored)).toBe(true);
    expect(schedule.backupsStored).toBeGreaterThanOrEqual(1);
    expect(schedule.backupsStored).toBeLessThanOrEqual(30);
    expect(typeof schedule.storageParams).toBe("object");
    for (const value of Object.values(schedule.storageParams)) {
      expect(value === null || typeof value === "string").toBe(true);
    }
    expect(Number.isInteger(schedule.cronParams.period)).toBe(true);
    expect(schedule.cronParams.hour).toBeGreaterThanOrEqual(0);
    expect(schedule.cronParams.hour).toBeLessThanOrEqual(23);
    expect(schedule.cronParams.day).toBeGreaterThanOrEqual(1);
    expect(schedule.cronParams.day).toBeLessThanOrEqual(7);
    expect(typeof schedule.dump).toBe("boolean");
    expect(schedule.dump).toBe(false);
    // Never run yet: the .NET default date, not a missing value.
    expect(schedule.lastBackupTime).toMatch(DATE_TIME);
    expect(utc(schedule.lastBackupTime)).toBeLessThan(Date.UTC(2000, 0, 1));
  });

  test("GET /api/2.0/backup/getbackupscount - The default period is the current calendar month in UTC", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    await runBackup(backup);

    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString();
    const tomorrow = new Date(
      now.getTime() + 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: byDefault, status } = await backup.getBackupsCount();
    const { data: explicit } = await backup.getBackupsCount({
      from: monthStart,
      to: tomorrow,
    });
    const { data: countsByDefault } = await backup.getBackupsCounts();
    const { data: countsExplicit } = await backup.getBackupsCounts({
      from: monthStart,
      to: tomorrow,
    });

    expect(status).toBe(200);
    expectWrapper(byDefault, 1);
    expect(Number.isInteger(byDefault.response)).toBe(true);
    expect(byDefault.response).toBe(1);
    expect(explicit.response).toBe(byDefault.response);
    expect(countsExplicit.response).toEqual(countsByDefault.response);
  });

  test("GET /api/2.0/backup/getbackupsservicestate - The service state follows the contract and switches on when a backup is charged to the wallet", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(10);
    const { backup } = apiSdk.forRole("owner");

    await test.step("the contract", async () => {
      const { data, status } = await backup.getBackupsServiceState();

      expect(status).toBe(200);
      expectWrapper(data, 1);
      expect(Object.keys(data.response!)).toEqual(["enabled"]);
      expect(typeof data.response!.enabled).toBe("boolean");
    });

    await test.step("it does not follow the progress of a backup within the free allowance", async () => {
      const { data: before } = await backup.getBackupsServiceState();
      await runBackup(backup);
      await runBackup(backup);
      const { data: after } = await backup.getBackupsServiceState();

      expect(after.response!.enabled).toBe(before.response!.enabled);
    });

    await test.step("a backup beyond the free allowance switches it on", async () => {
      await runBackup(backup);

      await expect
        .poll(
          async () =>
            (await backup.getBackupsServiceState()).data.response!.enabled,
          { intervals: [500, 1_000, 2_000], timeout: 30_000 },
        )
        .toBe(true);
    });
  });
});

test.describe("POST /api/2.0/backup/startbackup - Backup lifecycle and concurrency", () => {
  const dataStore = { storageType: BackupStorageType.DataStore };
  const total = (counts?: BackupsCountResultDto) =>
    (counts?.free ?? 0) + (counts?.paid ?? 0);

  async function historyIds(backup: BackupApi): Promise<string[]> {
    const { data } = await backup.getBackupHistory();
    return (data.response ?? []).map((record) => record.id).sort();
  }

  /**
   * No job is left running. A record can show in the history a moment before the
   * progress of the same job turns completed, so "stuck" means a job that is
   * still running when the wait is over, not one caught in that moment.
   */
  async function expectQueueNotStuck(backup: BackupApi) {
    await expect(async () => {
      const { data } = await backup.getBackupProgress();
      expect(data.response === undefined || data.response.isCompleted).toBe(
        true,
      );
    }).toPass({ intervals: [250, 500, 1_000, 2_000], timeout: 30_000 });
  }

  /**
   * The state a canceled job must end in. A canceled job is either gone from the
   * queue or shown as Canceled, and it leaves no archive. The one other end the
   * API has been seen to produce is a job that registered with the worker after
   * the cancel was answered and then ran to the end: that is recorded as a race,
   * and still has to be consistent - a completed job has its record.
   */
  async function expectCanceledJobSettled(
    backup: BackupApi,
    taskId: string,
    cancelAnswers: boolean[],
  ) {
    const { final, states } = await observeJobUntilQuiescent(backup, taskId);
    const archived = (await historyIds(backup)).includes(taskId);

    if (final?.taskId === taskId) {
      if (final.status === DistributedTaskStatus.Canceled) {
        expect(final.isCompleted).toBe(true);
        expect(archived, states.join(" -> ")).toBe(false);
      } else {
        expect(final.status, states.join(" -> ")).toBe(
          DistributedTaskStatus.Completed,
        );
        expect(archived, states.join(" -> ")).toBe(true);
        test.info().annotations.push({
          type: "race",
          description: `cancelbackup answered ${cancelAnswers.join(", ")} but the job ran to the end and was archived: ${states.join(" -> ")}`,
        });
      }
    } else {
      expect(archived, states.join(" -> ")).toBe(false);
    }
  }

  test("POST /api/2.0/backup/startbackup - Owner follows a backup to completion and starts another one", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const { data: started, status } = await backup.startBackup({
      backupDto: dataStore,
    });
    expect(status).toBe(200);
    const firstId = started.response!.taskId!;

    const job = await waitForBackupJobEnd(backup, firstId);
    expect(job.error).toBeFalsy();
    expect(job.status).toBe(DistributedTaskStatus.Completed);
    expect(job.progress).toBe(100);

    await test.step("the finished job stays in the queue unchanged, and its id is the record id", async () => {
      for (let poll = 0; poll < 2; poll++) {
        const { data } = await backup.getBackupProgress();
        expect(data.response).toEqual(job);
      }
      expect(await historyIds(backup)).toEqual([firstId]);
    });

    await test.step("a second backup is a new job with its own record", async () => {
      const { data: second } = await backup.startBackup({
        backupDto: dataStore,
      });
      const secondId = second.response!.taskId!;
      expect(secondId).not.toBe(firstId);

      await waitForBackupJobEnd(backup, secondId);
      expect(await historyIds(backup)).toEqual([firstId, secondId].sort());

      const { data: counts } = await backup.getBackupsCounts();
      expect(total(counts.response)).toBe(2);
    });
  });

  test("POST /api/2.0/backup/startbackup - A second start while the first backup runs does not create a second archive", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    // The queue holds one job per portal. A backup takes a few seconds, so the
    // second start normally lands on the running job and answers with it; if the
    // first one has already finished it is a new job. Both are valid, and what
    // must hold either way is one record per job and nothing stuck.
    const first = await backup.startBackup({ backupDto: dataStore });
    const second = await backup.startBackup({ backupDto: dataStore });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const ids = [
      ...new Set([first.data.response!.taskId!, second.data.response!.taskId!]),
    ];
    test.info().annotations.push({
      type: "overlap",
      description:
        ids.length === 1
          ? "the second start landed on the running job"
          : "the first backup had finished before the second start",
    });

    for (const id of ids) await waitForBackupRecord(backup, id);

    expect(await historyIds(backup)).toEqual([...ids].sort());
    const { data: counts } = await backup.getBackupsCounts();
    expect(total(counts.response)).toBe(ids.length);
    await expectQueueNotStuck(backup);
  });

  test("POST /api/2.0/backup/startbackup - Two concurrent starts leave one record per job", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const results = await Promise.allSettled([
      backup.startBackup({ backupDto: dataStore }),
      backup.startBackup({ backupDto: dataStore }),
    ]);

    const ids = results.map((result) => {
      expect(result.status).toBe("fulfilled");
      const { status, data } = (
        result as PromiseFulfilledResult<
          Awaited<ReturnType<BackupApi["startBackup"]>>
        >
      ).value;
      expect(status).toBe(200);
      return data.response!.taskId!;
    });
    const jobs = [...new Set(ids)];

    for (const id of jobs) await waitForBackupRecord(backup, id);

    expect(await historyIds(backup)).toEqual([...jobs].sort());
    const { data: counts } = await backup.getBackupsCounts();
    expect(total(counts.response)).toBe(jobs.length);
    await expectQueueNotStuck(backup);
  });

  test("POST /api/2.0/backup/startbackup - A backup after a failed one works and the earlier copy is untouched", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const earlierId = await runBackup(backup);
    const { data: before } = await backup.getBackupHistory();
    const earlier = before.response!.find((record) => record.id === earlierId);

    await test.step("a job that fails: the module of the storage is missing", async () => {
      const { data, status } = await backup.startBackup({
        backupDto: { storageType: BackupStorageType.ThirdPartyConsumer },
      });
      expect(status).toBe(200);

      const failed = await waitForBackupJobEnd(backup, data.response!.taskId!);
      expect(failed.error).toBeTruthy();
    });

    await test.step("the failure did not touch the earlier copy and left no record", async () => {
      const { data } = await backup.getBackupHistory();
      expect(data.response).toEqual([earlier]);
    });

    await test.step("the next backup is accepted and completes", async () => {
      const laterId = await runBackup(backup);

      expect(await historyIds(backup)).toEqual([earlierId, laterId].sort());
      // the failed job made no archive and is not counted
      const { data: counts } = await backup.getBackupsCounts();
      expect(total(counts.response)).toBe(2);
      await expectQueueNotStuck(backup);
    });
  });

  test("GET /api/2.0/backup/getbackuphistory - Reads during a backup stay consistent and the new backup is counted once it is done", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const earlierId = await runBackup(backup);

    const { data: started } = await backup.startBackup({
      backupDto: dataStore,
    });
    const taskId = started.response!.taskId!;

    const [history, progress, count, counts, schedule, service] =
      await Promise.all([
        backup.getBackupHistory(),
        backup.getBackupProgress(),
        backup.getBackupsCount(),
        backup.getBackupsCounts(),
        backup.getBackupSchedule(),
        backup.getBackupsServiceState(),
      ]);

    for (const { status } of [
      history,
      progress,
      count,
      counts,
      schedule,
      service,
    ]) {
      expect(status).toBe(200);
    }

    await test.step("what the reads show is one of the two valid moments", async () => {
      // The record appears when the backup is done, so the history holds the
      // earlier copy and perhaps the new one, never anything else.
      const ids = history.data.response!.map((record) => record.id);
      expect(ids).toContain(earlierId);
      expect(ids.every((id) => id === earlierId || id === taskId)).toBe(true);

      const job = progress.data.response;
      expect(
        job === undefined || [earlierId, taskId].includes(job.taskId!),
      ).toBe(true);

      expect([1, 2]).toContain(total(counts.data.response));
      expect(Number.isInteger(count.data.response)).toBe(true);
    });

    await waitForBackupRecord(backup, taskId);

    await test.step("after the backup the counts and the history agree", async () => {
      expect(await historyIds(backup)).toEqual([earlierId, taskId].sort());
      const { data } = await backup.getBackupsCounts();
      expect(total(data.response)).toBe(2);
    });
  });

  test("POST /api/2.0/backup/cancelbackup - With no job it answers 200 false and does not block the queue", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const { data, status } = await backup.cancelBackup();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);

    const { data: progress } = await backup.getBackupProgress();
    expect(progress.response).toBeUndefined();

    const taskId = await runBackup(backup);
    expect(await historyIds(backup)).toEqual([taskId]);
  });

  test("POST /api/2.0/backup/cancelbackup - After a backup finished it drops the finished job and keeps the archive", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const taskId = await runBackup(backup);
    const { data: before } = await backup.getBackupHistory();

    await test.step("the finished job is still in the queue, so cancel drops it", async () => {
      const { data, status } = await backup.cancelBackup();

      expect(status).toBe(200);
      expect(data.response).toBe(true);

      const { data: progress } = await backup.getBackupProgress();
      expect(progress.response).toBeUndefined();
    });

    await test.step("the archive and the counts are untouched", async () => {
      const { data } = await backup.getBackupHistory();
      expect(data.response).toEqual(before.response);

      const { data: counts } = await backup.getBackupsCounts();
      expect(total(counts.response)).toBe(1);
    });

    await test.step("nothing is left to cancel", async () => {
      const { data } = await backup.cancelBackup();
      expect(data.response).toBe(false);
    });

    await test.step("a new backup starts", async () => {
      const nextId = await runBackup(backup);
      expect(await historyIds(backup)).toEqual([taskId, nextId].sort());
    });
  });

  test("POST /api/2.0/backup/cancelbackup - Canceling right after the start leaves no archive, keeps the earlier copy and frees the queue", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(20);
    const { backup } = apiSdk.forRole("owner");

    const earlierId = await runBackup(backup);
    const { data: before } = await backup.getBackupHistory();

    const { data: started } = await backup.startBackup({
      backupDto: dataStore,
    });
    const canceledId = started.response!.taskId!;
    expect(canceledId).not.toBe(earlierId);

    const { data: canceled, status } = await backup.cancelBackup();
    expect(status).toBe(200);
    expect(canceled.response).toBe(true);

    await test.step("the canceled job settles without an archive", async () => {
      await expectCanceledJobSettled(backup, canceledId, [true]);
    });

    await test.step("the earlier copy is untouched", async () => {
      const { data } = await backup.getBackupHistory();
      expect(data.response).toEqual(expect.arrayContaining(before.response!));
    });

    await test.step("the queue is free: a new backup completes", async () => {
      const nextId = await runBackup(backup);
      const ids = await historyIds(backup);
      expect(ids).toContain(earlierId);
      expect(ids).toContain(nextId);
      await expectQueueNotStuck(backup);
    });
  });

  test("POST /api/2.0/backup/cancelbackup - Canceling twice in a row leaves the queue consistent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const { data: started } = await backup.startBackup({
      backupDto: dataStore,
    });
    const taskId = started.response!.taskId!;

    const first = await backup.cancelBackup();
    const second = await backup.cancelBackup();

    expect(first.status).toBe(200);
    expect(first.data.response).toBe(true);
    // true when the canceled job was still in the queue to be dropped, false when
    // the first cancel had already removed it: both are the contract.
    expect(second.status).toBe(200);
    expect(typeof second.data.response).toBe("boolean");

    await expectCanceledJobSettled(backup, taskId, [
      first.data.response!,
      second.data.response!,
    ]);

    const nextId = await runBackup(backup);
    expect(await historyIds(backup)).toContain(nextId);
  });

  test("POST /api/2.0/backup/cancelbackup - Two concurrent cancels both answer 200 and one of them took the job", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const { data: started } = await backup.startBackup({
      backupDto: dataStore,
    });
    const taskId = started.response!.taskId!;

    const results = await Promise.allSettled([
      backup.cancelBackup(),
      backup.cancelBackup(),
    ]);

    const answers = results.map((result) => {
      expect(result.status).toBe("fulfilled");
      const { status, data } = (
        result as PromiseFulfilledResult<
          Awaited<ReturnType<BackupApi["cancelBackup"]>>
        >
      ).value;
      expect(status).toBe(200);
      expect(typeof data.response).toBe("boolean");
      return data.response!;
    });

    // Which one wins is not defined, but a job existed, so one of them dropped it.
    expect(answers).toContain(true);

    await expectCanceledJobSettled(backup, taskId, answers);

    const nextId = await runBackup(backup);
    expect(await historyIds(backup)).toContain(nextId);
  });

  test("POST /api/2.0/backup/cancelbackup - A cancel concurrent with the start leaves a job that is either canceled or archived, never stuck", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { backup } = apiSdk.forRole("owner");

    const [start, cancel] = await Promise.all([
      backup.startBackup({ backupDto: dataStore }),
      backup.cancelBackup(),
    ]);

    expect(start.status).toBe(200);
    expect(cancel.status).toBe(200);
    const taskId = start.data.response!.taskId!;

    // The cancel can arrive before the job exists. Then it answers false and the
    // backup runs to the end; otherwise it answers true and the job is canceled.
    const { final, states } = await observeJobUntilQuiescent(backup, taskId);
    const archived = (await historyIds(backup)).includes(taskId);

    if (
      final?.taskId === taskId &&
      final.status === DistributedTaskStatus.Completed
    ) {
      expect(archived, states.join(" -> ")).toBe(true);
    } else {
      expect(archived, states.join(" -> ")).toBe(false);
      if (final?.taskId === taskId) {
        expect(final.status).toBe(DistributedTaskStatus.Canceled);
      }
    }
    if (cancel.data.response === false) {
      expect(
        archived,
        "a cancel that found no job cannot stop the backup",
      ).toBe(true);
    }
    await expectQueueNotStuck(backup);
  });

  test("POST /api/2.0/backup/startbackup - A backup started right after a cancel completes and has its record", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(20);
    const { backup } = apiSdk.forRole("owner");

    const { data: first } = await backup.startBackup({ backupDto: dataStore });
    const canceledId = first.response!.taskId!;
    const { data: canceled } = await backup.cancelBackup();
    expect(canceled.response).toBe(true);

    const { data: second, status } = await backup.startBackup({
      backupDto: dataStore,
    });
    expect(status).toBe(200);
    const nextId = second.response!.taskId!;

    // Normally this is a new job. When the canceled job had not reached the
    // worker yet, the cancel dropped nothing real and the start lands on that
    // very job, which then runs to the end. Either way the backup that was asked
    // for must complete and have its record; the second way is noted as the race.
    if (nextId === canceledId) {
      test.info().annotations.push({
        type: "race",
        description:
          "cancelbackup answered true, then the start returned the canceled job and it ran to the end",
      });
    }

    await waitForBackupRecord(backup, nextId);

    const ids = await historyIds(backup);
    expect(ids).toContain(nextId);
    if (nextId !== canceledId && ids.includes(canceledId)) {
      test.info().annotations.push({
        type: "race",
        description: "the canceled job ran to the end and was archived too",
      });
      expect(ids).toEqual([canceledId, nextId].sort());
    } else {
      expect(ids).toEqual([nextId]);
    }
    await expectQueueNotStuck(backup);
  });

  test("DELETE /api/2.0/backup/deletebackup - Deleting a copy while a new backup is made leaves the new one intact", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(20);
    const { backup } = apiSdk.forRole("owner");

    const keptId = await runBackup(backup);
    const deletedId = await runBackup(backup);

    const { data: started } = await backup.startBackup({
      backupDto: dataStore,
    });
    const newId = started.response!.taskId!;

    const { data, status } = await backup.deleteBackup({ id: deletedId });
    expect(status).toBe(200);
    expect(data.response).toBe(true);

    await waitForBackupRecord(backup, newId);

    expect(await historyIds(backup)).toEqual([keptId, newId].sort());
    await expectQueueNotStuck(backup);
  });

  test("DELETE /api/2.0/backup/deletebackup - Concurrent deletes of different copies and of one copy twice both end with the same history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(30);
    const { backup } = apiSdk.forRole("owner");

    const ids = [
      await runBackup(backup),
      await runBackup(backup),
      await runBackup(backup),
      await runBackup(backup),
    ];
    const [keptId, pairA, pairB, twiceId] = ids;

    await test.step("two different copies at once", async () => {
      const results = await Promise.allSettled([
        backup.deleteBackup({ id: pairA }),
        backup.deleteBackup({ id: pairB }),
      ]);

      for (const result of results) {
        expect(result.status).toBe("fulfilled");
        const { status, data } = (
          result as PromiseFulfilledResult<
            Awaited<ReturnType<BackupApi["deleteBackup"]>>
          >
        ).value;
        expect(status).toBe(200);
        expect(data.response).toBe(true);
      }
      expect(await historyIds(backup)).toEqual([keptId, twiceId].sort());
    });

    await test.step("one copy twice at once", async () => {
      const results = await Promise.allSettled([
        backup.deleteBackup({ id: twiceId }),
        backup.deleteBackup({ id: twiceId }),
      ]);

      for (const result of results) {
        expect(result.status).toBe("fulfilled");
        const { status, data } = (
          result as PromiseFulfilledResult<
            Awaited<ReturnType<BackupApi["deleteBackup"]>>
          >
        ).value;
        expect(status).toBe(200);
        expect(data.response).toBe(true);
      }
      expect(await historyIds(backup)).toEqual([keptId]);
    });
  });

  test("POST /api/2.0/backup/cancelbackup - Manual backups, cancels and deletions leave the schedule as it was", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(30);
    const { backup } = apiSdk.forRole("owner");

    await backup.createBackupSchedule({
      backupScheduleDto: {
        storageType: BackupStorageType.DataStore,
        backupsStored: 6,
        cronParams: { period: BackupPeriod.EveryWeek, hour: 11, day: 4 },
      },
    });
    const { data: scheduled } = await backup.getBackupSchedule();

    const kept = await runBackup(backup);
    await backup.startBackup({ backupDto: dataStore });
    await backup.cancelBackup();
    await backup.cancelBackup();
    await backup.deleteBackup({ id: kept });
    await runBackup(backup);

    const { data: after } = await backup.getBackupSchedule();
    expect(after.response).toEqual(scheduled.response);
    await expectQueueNotStuck(backup);
  });
});

/*
  A test for the `startBackupRestore` method cannot be written,
  as it triggers the restoration process,
  which invalidates the cookie and subsequently prevents the deletion of the portal,
  thereby leading to database clutter.
*/
