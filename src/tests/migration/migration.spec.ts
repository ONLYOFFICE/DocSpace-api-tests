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

    // The parse is accepted first and fails only once it runs, so the
    // status has to be read until it settles.
    await expect(async () => {
      const { data } = await ownerApi.migration.getMigrationStatus();
      expect(data.response?.isCompleted).toBe(true);
      expect(data.response?.error).toBeTruthy();
    }).toPass({ intervals: [500, 1000, 2000], timeout: 20000 });
  });

  test("Owner's parse queues and then fails cleanly for an unknown migrator name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.migration.uploadAndInitializeMigration({
      migratorName: "TotallyNotARealMigrator",
    });
    expect(status).toBe(200);

    // The parse is accepted first and fails only once it runs, so the
    // status has to be read until it settles.
    await expect(async () => {
      const { data } = await ownerApi.migration.getMigrationStatus();
      expect(data.response?.isCompleted).toBe(true);
      expect(data.response?.error).toBeTruthy();
    }).toPass({ intervals: [500, 1000, 2000], timeout: 20000 });
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
  /**
   * A job that failed before `SaveLogAsync` ever ran should answer 404, the
   * same as no job at all. It answers 403 instead, and not with an error body
   * but with a raw Kestrel crash: "Response Content-Length mismatch: too many
   * bytes written (167 of 0)". The handler sets `Content-Length` from
   * `stream.Length` before writing the body, so once that header is out an
   * error body no longer fits (MigrationController.cs, MigrationLogger.cs).
   * Whoever clicks "download log" after a failed migration gets a permission
   * error for something nothing forbids. 6 runs out of 6.
   *
   * The wait below is what makes that reachable at all. The parse runs behind
   * the request, so right after init the job is queued with an empty `error`
   * and the endpoint answers a perfectly correct 404 - there is nothing to
   * report yet. Without the wait this test passed in CI for two nights
   * running, reporting an unexpected pass while never reaching the case it is
   * named after; locally, on a quicker portal, it reproduced every time. The
   * endpoint was never the unstable part.
   *
   * Caveat of `test.fail`: it counts ANY throw as the expected one, in a hook
   * as well as in the body (checked 2026-11-17), so a setup that broke outright
   * would still read green here. What guards against that is the rest of this
   * file - several tests drive the same init and would go red first.
   */
  test.fail(
    "BUG 84791: logs for a job that failed before writing any log crash instead of a clean 404",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status: initStatus } =
        await ownerApi.migration.uploadAndInitializeMigration({
          migratorName: "Nextcloud",
        });
      expect(initStatus).toBe(200);

      await expect(async () => {
        const { data } = await ownerApi.migration.getMigrationStatus();
        expect(data.response, "no migration job was registered").toBeTruthy();
        expect(data.response!.error, "the job has not failed yet").toBeTruthy();
      }).toPass({ intervals: [500, 1_000, 2_000], timeout: 60_000 });

      const { status } = await ownerApi.migration.getMigrationLogs();
      expect(status).toBe(404);
    },
  );
});
