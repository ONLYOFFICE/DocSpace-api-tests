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
  test.fail(
    "BUG : GET /api/2.0/migration/logs - Owner gets 404 when no migration has run",
    async ({ apiSdk }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .migration.getMigrationLogs();

      expect(status).toBe(404);
      expect((data as any).error?.message).toBe("No migration is in progress");
    },
  );

  test.fail(
    "BUG : GET /api/2.0/migration/logs - DocSpaceAdmin gets 404 when no migration has run",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .migration.getMigrationLogs();

      expect(status).toBe(404);
      expect((data as any).error?.message).toBe("No migration is in progress");
    },
  );
});

// POST /api/2.0/migration/init/{migratorName} (uploadAndInitializeMigration) cannot be fully tested:
// requires uploading a real migration dump file from a third-party service (Nextcloud, ownCloud, etc.)

// POST /api/2.0/migration/migrate (startMigration) cannot be tested:
// depends on a successfully initialized migration via uploadAndInitializeMigration

// POST /api/2.0/migration/finish (finishMigration) cannot be tested:
// depends on a completed migration process

// POST /api/2.0/migration/cancel (cancelMigration) cannot be tested:
// requires an active migration in progress

// POST /api/2.0/migration/clear (clearMigration) cannot be tested:
// requires a completed or failed migration to clear
