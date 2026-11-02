import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("GET /api/2.0/migration/list", () => {
  test("GET /api/2.0/migration/list - Owner gets list of available migrations", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .migration.listMigrations();

    expect(status).toBe(200);
    expect(data.response).toEqual(
      expect.arrayContaining(["Workspace", "Nextcloud", "GoogleWorkspace"]),
    );
    expect(data.count).toBe(data.response?.length);
    expect(data.links?.[0].action).toBe("GET");
  });

  test("GET /api/2.0/migration/list - DocSpaceAdmin gets list of available migrations", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .migration.listMigrations();

    expect(status).toBe(200);
    expect(data.response).toEqual(
      expect.arrayContaining(["Workspace", "Nextcloud", "GoogleWorkspace"]),
    );
    expect(data.count).toBe(data.response?.length);
    expect(data.links?.[0].action).toBe("GET");
  });
});

test.describe("GET /api/2.0/migration/status", () => {
  test("GET /api/2.0/migration/status - Owner gets migration status when no migration is running", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .migration.getMigrationStatus();

    expect(status).toBe(200);
    expect(data).toBeDefined();
  });

  test("GET /api/2.0/migration/status - DocSpaceAdmin gets migration status when no migration is running", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .migration.getMigrationStatus();

    expect(status).toBe(200);
    expect(data).toBeDefined();
  });
});

test.describe("GET /api/2.0/migration/logs", () => {
  test("BUG 81653: GET /api/2.0/migration/logs - Owner gets 404 when no migration has run", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .migration.getMigrationLogs();

    expect(status).toBe(404);
    expect((data as any).error?.message).toBe("No migration is in progress");
  });

  test("BUG 81653: GET /api/2.0/migration/logs - DocSpaceAdmin gets 404 when no migration has run", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .migration.getMigrationLogs();

    expect(status).toBe(404);
    expect((data as any).error?.message).toBe("No migration is in progress");
  });
});

// The 5 write methods below don't actually need a real migration dump file to
// exercise - confirmed live: cancelMigration/clearMigration are documented as
// idempotent and answer 200 even with nothing running; finishMigration and
// startMigration likewise no-op with 200 when there's no job; and
// uploadAndInitializeMigration queues immediately (200) even when no backup
// was ever uploaded or the migrator name is unknown - the resulting failure
// shows up in GET /migration/status's `error` field, exactly as documented
// ("a name that is not in it is not rejected ... the queued job ends with
// the failure reported in error").

test.describe("POST /api/2.0/migration/cancel", () => {
  test("Owner can cancel when nothing is running - idempotent, safe to retry", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const first = await ownerApi.migration.cancelMigration();
    expect(first.status).toBe(200);

    const second = await ownerApi.migration.cancelMigration();
    expect(second.status).toBe(200);
  });
});

test.describe("POST /api/2.0/migration/finish", () => {
  test("Owner is refused with 400 when isSendWelcomeEmail is missing", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .migration.finishMigration();

    expect(status).toBe(400);
  });

  test("Owner can finish when nothing is running", async ({ apiSdk }) => {
    const { status } = await apiSdk.forRole("owner").migration.finishMigration({
      finishDto: { isSendWelcomeEmail: false },
    });

    expect(status).toBe(200);
  });
});

test.describe("POST /api/2.0/migration/migrate", () => {
  test("Owner's call is a no-op when nothing was ever parsed", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").migration.startMigration();

    expect(status).toBe(200);
  });
});

test.describe("POST /api/2.0/migration/init/:migratorName", () => {
  test("Owner's parse queues and then fails cleanly when no backup was ever uploaded", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.migration.uploadAndInitializeMigration({
      migratorName: "Nextcloud",
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.migration.getMigrationStatus();
    expect(data.response?.isCompleted).toBe(true);
    expect(data.response?.error).toBeTruthy();
  });

  test("Owner's parse queues and then fails cleanly for an unknown migrator name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.migration.uploadAndInitializeMigration({
      migratorName: "TotallyNotARealMigrator",
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.migration.getMigrationStatus();
    expect(data.response?.isCompleted).toBe(true);
    expect(data.response?.error).toBeTruthy();
  });
});

test.describe("POST /api/2.0/migration/clear", () => {
  test("Owner can clear when nothing is running - idempotent, safe to retry", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const first = await ownerApi.migration.clearMigration();
    expect(first.status).toBe(200);

    const second = await ownerApi.migration.clearMigration();
    expect(second.status).toBe(200);
  });

  // BUG 84792: confirmed live, reproducible both with a synthetic failure (no
  // backup ever uploaded) and a realistic one (a real but invalid archive
  // uploaded via migrationFileUpload.ashx, failing with "Archive must be
  // .zip"). clearMigration answers 200 but GET /migration/status keeps
  // reporting the exact same finished/failed job afterward, even after a
  // 1.5s wait - not a race, the job is never actually cleared.
  test.fail(
    "BUG 84792: clearMigration answers 200 but does not actually clear a finished/failed job",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.migration.uploadAndInitializeMigration({
        migratorName: "TotallyNotARealMigrator",
      });
      const before = await ownerApi.migration.getMigrationStatus();
      expect(before.data.response?.isCompleted).toBe(true);

      const { status } = await ownerApi.migration.clearMigration();
      expect(status).toBe(200);

      const after = await ownerApi.migration.getMigrationStatus();
      expect(after.data.response).toBeFalsy();
    },
  );
});

test.describe("GET /api/2.0/migration/logs - after a failed job", () => {
  // BUG 84791: confirmed live for a RECOGNIZED migrator name, reproducible
  // both with a synthetic failure (no backup ever uploaded) and a realistic
  // one (a real but invalid archive, failing with "Archive must be .zip").
  // A job that failed before ever writing a log file should sensibly answer
  // 404 (same as the no-job-at-all case right above), but instead answers
  // 403 with a body that isn't even a normal error response - it's a raw
  // Kestrel-level crash ("System.InvalidOperationException: Response
  // Content-Length mismatch: too many bytes written"), reproduced 3/3 times.
  // (An UNRECOGNIZED migrator name does not trigger this - that path 404s
  // correctly, presumably because no job folder is created at all before
  // the name is found to be invalid.)
  test.fail(
    "BUG 84791: logs for a job that failed before writing any log crash instead of a clean 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.migration.uploadAndInitializeMigration({
        migratorName: "Nextcloud",
      });

      const { status } = await ownerApi.migration.getMigrationLogs();
      expect(status).toBe(404);
    },
  );
});
