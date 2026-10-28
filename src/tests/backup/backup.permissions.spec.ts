import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  BackupPeriod,
  BackupStorageType,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";
import config from "@/config";
import {
  expectRestoreNotStarted,
  runBackup,
  snapshotBackups,
  startRestoreThatCannotQueue,
} from "@/src/helpers/backup";

// Never a GUID and never a path: see assertRestoreRequestCannotQueue.
const NOT_A_GUID = "not-a-guid";

test.describe("POST /api/2.0/backup/cancelbackup - access control", () => {
  test("POST /api/2.0/backup/cancelbackup - Cancel backup without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.cancelBackup();

    expect(status).toBe(401);
  });

  test("POST /api/2.0/backup/cancelbackup - RoomAdmin cancels backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.cancelBackup();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/backup/cancelbackup - User cancels backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.cancelBackup();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/backup/cancelbackup - Guest cancels backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.cancelBackup();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /portal/backup/start - access control", () => {
  test("POST /portal/backup/start - Start backup without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.startBackup({
      startBackupRequestDto: { storageType: BackupStorageType.DataStore },
    });

    expect(status).toBe(401);
  });

  test("POST /portal/backup/start - Start backup without paid plan", async ({
    apiSdk,
  }) => {
    test.fail(
      !!config.LOCAL_PORTAL_DOMAIN,
      "Payment checks are not enforced on local instances",
    );
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      startBackupRequestDto: { storageType: BackupStorageType.DataStore },
    });

    expect(status).toBe(402);
    expect(data.statusCode).toBe(402);
    expect((data as any).error.message).toBe(
      "Your pricing plan does not support this option",
    );
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
      startBackupRequestDto: { storageType: BackupStorageType.DataStore },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
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
      startBackupRequestDto: { storageType: BackupStorageType.DataStore },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
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
      startBackupRequestDto: { storageType: BackupStorageType.DataStore },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /portal/backup/start - Start backup with non-existent folder", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      startBackupRequestDto: {
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "folderId", value: "99999999" }],
      },
    });

    expect(status).toBe(404);
    expect(data.statusCode).toBe(404);
    expect((data as any).error).toBeDefined();
  });

  // BUG 79523: POST /portal/backup/start returns 500 instead of 400 for invalid folderId format
  test("BUG 79523: POST /portal/backup/start - Start backup with invalid folderId format returns 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      startBackupRequestDto: {
        storageType: BackupStorageType.Documents,
        storageParams: [{ key: "folderId", value: "invalid_value" }],
      },
    });

    expect(status).toBe(400);
    expect(data.statusCode).toBe(400);
    expect((data as any).error).toBeDefined();
  });

  test("POST /portal/backup/start - Start backup with wrong folder type", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.backup.startBackup({
      startBackupRequestDto: {
        storageType: BackupStorageType.ThridpartyDocuments,
        storageParams: [{ key: "folderId", value: String(roomId) }],
      },
    });

    expect(status).toBe(400);
    expect(data.statusCode).toBe(400);
    expect((data as any).error).toBeDefined();
  });

  test("POST /portal/backup/start - Start backup as dump", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail(
      !!config.LOCAL_PORTAL_DOMAIN,
      "Payment checks are not enforced on local instances",
    );
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.startBackup({
      startBackupRequestDto: {
        storageType: BackupStorageType.DataStore,
        dump: true,
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/backup/createbackupschedule - access control", () => {
  const scheduleDto = {
    storageType: BackupStorageType.DataStore,
    backupsStored: 5,
    cronParams: { period: BackupPeriod.EveryDay, hour: 3 },
  };

  test("POST /api/2.0/backup/createbackupschedule - Create schedule without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.createBackupSchedule({
      createBackupScheduleRequestDto: scheduleDto,
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/backup/createbackupschedule - Create schedule without paid plan", async ({
    apiSdk,
  }) => {
    test.fail(
      !!config.LOCAL_PORTAL_DOMAIN,
      "Payment checks are not enforced on local instances",
    );
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.createBackupSchedule({
      createBackupScheduleRequestDto: scheduleDto,
    });

    expect(status).toBe(402);
    expect(data.statusCode).toBe(402);
    expect((data as any).error.message).toBe(
      "Your pricing plan does not support this option",
    );
  });

  test("POST /api/2.0/backup/createbackupschedule - RoomAdmin creates schedule", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.createBackupSchedule({
      createBackupScheduleRequestDto: scheduleDto,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/backup/createbackupschedule - User creates schedule", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.createBackupSchedule({
      createBackupScheduleRequestDto: scheduleDto,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/backup/createbackupschedule - Guest creates schedule", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.createBackupSchedule({
      createBackupScheduleRequestDto: scheduleDto,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/backup/getbackupschedule - access control", () => {
  test("GET /api/2.0/backup/getbackupschedule - Get schedule without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.getBackupSchedule();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/backup/getbackupschedule - RoomAdmin gets schedule", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.getBackupSchedule();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/backup/getbackupschedule - User gets schedule", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.getBackupSchedule();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/backup/getbackupschedule - Guest gets schedule", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.getBackupSchedule();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/backup/deletebackupschedule - access control", () => {
  test("DELETE /api/2.0/backup/deletebackupschedule - Delete schedule without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.deleteBackupSchedule();

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/backup/deletebackupschedule - RoomAdmin deletes schedule", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.deleteBackupSchedule();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/backup/deletebackupschedule - User deletes schedule", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.deleteBackupSchedule();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/backup/deletebackupschedule - Guest deletes schedule", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.deleteBackupSchedule();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/backup/getbackupprogress - access control", () => {
  test("GET /api/2.0/backup/getbackupprogress - Get backup progress without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.getBackupProgress();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/backup/getbackupprogress - RoomAdmin gets backup progress", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.getBackupProgress();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/backup/getbackupprogress - User gets backup progress", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.getBackupProgress();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/backup/getbackupprogress - Guest gets backup progress", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.getBackupProgress();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/backup/getbackupscount - access control", () => {
  test("GET /api/2.0/backup/getbackupscount - Get backups count without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.getBackupsCount();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/backup/getbackupscount - RoomAdmin gets backups count", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.getBackupsCount();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/backup/getbackupscount - User gets backups count", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.getBackupsCount();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/backup/getbackupscount - Guest gets backups count", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.getBackupsCount();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/backup/getbackupscountbypaid - access control", () => {
  test("GET /api/2.0/backup/getbackupscountbypaid - Get counts without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.getBackupsCounts();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/backup/getbackupscountbypaid - DocSpaceAdmin gets the counts of the portal", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await runBackup(ownerApi.backup);

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.backup.getBackupsCounts();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toEqual({ free: 1, paid: 0 });
  });

  for (const userType of ["RoomAdmin", "User", "Guest"] as const) {
    test(`GET /api/2.0/backup/getbackupscountbypaid - ${userType} gets counts`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");

      await test.step("the owner reads the counts: the endpoint works on this portal", async () => {
        const { status } = await ownerApi.backup.getBackupsCounts();
        expect(status).toBe(200);
      });

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.backup.getBackupsCounts();

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }
});

// Authorization comes before the semantic validation of the controller: a caller
// without the portal settings permission is refused with 403 whatever the body
// holds, so nothing about the validity of the parameters leaks to them. The
// bodies are well-formed JSON of the right types, because a malformed one is
// refused with 400 by the framework before authorization.
test.describe("Backup validation - access control with invalid parameters", () => {
  const unknownGuid = "11111111-2222-3333-4444-555555555555";

  test("POST /api/2.0/backup/startbackup - Anonymous caller with an invalid storageType gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().backup.startBackup({
      startBackupRequestDto: { storageType: 99 as BackupStorageType },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/backup/startrestore - Anonymous caller with a backupId that is not a GUID gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await startRestoreThatCannotQueue(
      apiSdk.forAnonymous().backup,
      { backupId: "not-a-guid" },
    );

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/backup/deletebackup - Anonymous caller with an unknown id gets 401", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .backup.deleteBackup({ id: unknownGuid });

    expect(status).toBe(401);
  });

  for (const userType of ["RoomAdmin", "User", "Guest"] as const) {
    test(`POST /api/2.0/backup/startbackup - ${userType} with an invalid storageType gets 403 and starts nothing`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.backup.startBackup({
        startBackupRequestDto: { storageType: 99 as BackupStorageType },
      });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");

      const snapshot = await snapshotBackups(apiSdk.forRole("owner").backup);
      expect(snapshot.job).toBeUndefined();
      expect(snapshot.historyIds).toEqual([]);
    });

    test(`POST /api/2.0/backup/startbackup - ${userType} with a folder that does not exist gets 403, not 404`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.backup.startBackup({
        startBackupRequestDto: {
          storageType: BackupStorageType.Documents,
          storageParams: [{ key: "folderId", value: "99999999" }],
        },
      });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });

    test(`DELETE /api/2.0/backup/deletebackup - ${userType} with an unknown id gets 403 and deletes nothing`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");
      await runBackup(ownerApi.backup);
      const before = await snapshotBackups(ownerApi.backup);

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        userType,
      );

      const { data, status } = await memberApi.backup.deleteBackup({
        id: unknownGuid,
      });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");

      expect(await snapshotBackups(ownerApi.backup)).toEqual(before);
    });
  }
});

test.describe("GET /api/2.0/backup/getbackupsservicestate - access control", () => {
  test("GET /api/2.0/backup/getbackupsservicestate - Get service state without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.getBackupsServiceState();

    expect(status).toBe(401);
  });

  test("BUG 80574: GET /api/2.0/backup/getbackupsservicestate - RoomAdmin gets service state", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.getBackupsServiceState();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80574: GET /api/2.0/backup/getbackupsservicestate - User gets service state", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.getBackupsServiceState();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 80574: GET /api/2.0/backup/getbackupsservicestate - Guest gets service state", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.getBackupsServiceState();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

// Note: 402 is not covered — the SDK incorrectly describes this method as plan-restricted.
test.describe("GET /api/2.0/backup/getbackuphistory - access control", () => {
  test("GET /api/2.0/backup/getbackuphistory - Get backup history without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.getBackupHistory();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/backup/getbackuphistory - RoomAdmin gets backup history", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.getBackupHistory();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/backup/getbackuphistory - User gets backup history", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.getBackupHistory();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/backup/getbackuphistory - Guest gets backup history", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.getBackupHistory();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/backup/deletebackup - access control", () => {
  test("DELETE /api/2.0/backup/deletebackup - Delete backup without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.deleteBackup({
      id: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(401);
  });

  test.fail(
    "BUG 80608: DELETE /api/2.0/backup/deletebackup - Delete backup without paid plan",
    async ({ apiSdk }) => {
      test.fail(
        !!config.LOCAL_PORTAL_DOMAIN,
        "Payment checks are not enforced on local instances",
      );
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.backup.deleteBackup({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(status).toBe(402);
      expect(data.statusCode).toBe(402);
      expect((data as any).error.message).toBe(
        "Your pricing plan does not support this option",
      );
    },
  );

  test("BUG 80605: DELETE /api/2.0/backup/deletebackup - Delete non-existent backup returns 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.backup.deleteBackup({
      id: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(404);
    expect(data.statusCode).toBe(404);
    expect((data as any).error).toBeDefined();
  });

  test("DELETE /api/2.0/backup/deletebackup - RoomAdmin deletes backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.deleteBackup({
      id: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/backup/deletebackup - User deletes backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.deleteBackup({
      id: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/backup/deletebackup - Guest deletes backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.deleteBackup({
      id: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/backup/startrestore - access control", () => {
  test("POST /api/2.0/backup/startrestore - Start restore without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await startRestoreThatCannotQueue(
      anonApi.backup,
      undefined,
    );

    expect(status).toBe(401);
  });

  test("POST /api/2.0/backup/startrestore - Start restore without paid plan", async ({
    apiSdk,
  }) => {
    test.fail(
      !!config.LOCAL_PORTAL_DOMAIN,
      "Payment checks are not enforced on local instances",
    );
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await startRestoreThatCannotQueue(
      ownerApi.backup,
      { backupId: NOT_A_GUID, storageType: BackupStorageType.DataStore },
    );

    expect(status).toBe(402);
    expect(data.statusCode).toBe(402);
    expect((data as any).error.message).toBe(
      "Your pricing plan does not support this option",
    );
  });

  test("POST /api/2.0/backup/startrestore - RoomAdmin starts restore", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await startRestoreThatCannotQueue(
      roomAdminApi.backup,
      { backupId: NOT_A_GUID, storageType: BackupStorageType.DataStore },
    );

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");

    await expectRestoreNotStarted(apiSdk.forRole("owner").backup);
  });

  test("POST /api/2.0/backup/startrestore - User starts restore", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await startRestoreThatCannotQueue(userApi.backup, {
      backupId: NOT_A_GUID,
      storageType: BackupStorageType.DataStore,
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");

    await expectRestoreNotStarted(apiSdk.forRole("owner").backup);
  });

  test("POST /api/2.0/backup/startrestore - Guest starts restore", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await startRestoreThatCannotQueue(
      guestApi.backup,
      { backupId: NOT_A_GUID, storageType: BackupStorageType.DataStore },
    );

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");

    await expectRestoreNotStarted(apiSdk.forRole("owner").backup);
  });
});

// Note: 402 is not covered — the SDK incorrectly describes this method as plan-restricted.
test.describe("DELETE /api/2.0/backup/deletebackuphistory - access control", () => {
  test("DELETE /api/2.0/backup/deletebackuphistory - Delete backup history without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.backup.deleteBackupHistory();

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/backup/deletebackuphistory - RoomAdmin deletes backup history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.backup.deleteBackupHistory();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/backup/deletebackuphistory - User deletes backup history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.backup.deleteBackupHistory();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/backup/deletebackuphistory - Guest deletes backup history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.backup.deleteBackupHistory();

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});
