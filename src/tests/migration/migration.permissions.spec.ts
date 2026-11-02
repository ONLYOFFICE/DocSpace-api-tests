import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("GET /api/2.0/migration/list - permissions", () => {
  test("GET /api/2.0/migration/list - Anonymous cannot get migrations list", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().migration.listMigrations();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/migration/list - RoomAdmin cannot get migrations list", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .migration.listMigrations();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/migration/list - User cannot get migrations list", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .migration.listMigrations();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/migration/list - Guest cannot get migrations list", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .migration.listMigrations();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/migration/status - permissions", () => {
  test("GET /api/2.0/migration/status - Anonymous cannot get migration status", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .migration.getMigrationStatus();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/migration/status - RoomAdmin cannot get migration status", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .migration.getMigrationStatus();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/migration/status - User cannot get migration status", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .migration.getMigrationStatus();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/migration/status - Guest cannot get migration status", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .migration.getMigrationStatus();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/migration/logs - permissions", () => {
  test("GET /api/2.0/migration/logs - Anonymous cannot get migration logs", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().migration.getMigrationLogs();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/migration/logs - RoomAdmin cannot get migration logs", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .migration.getMigrationLogs();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/migration/logs - User cannot get migration logs", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .migration.getMigrationLogs();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/migration/logs - Guest cannot get migration logs", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .migration.getMigrationLogs();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/migration/cancel - permissions", () => {
  test("POST /api/2.0/migration/cancel - Anonymous cannot cancel migration", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().migration.cancelMigration();

    expect(status).toBe(401);
  });

  test("POST /api/2.0/migration/cancel - RoomAdmin cannot cancel migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .migration.cancelMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/cancel - User cannot cancel migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .migration.cancelMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/cancel - Guest cannot cancel migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .migration.cancelMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/migration/clear - permissions", () => {
  test("POST /api/2.0/migration/clear - Anonymous cannot clear migration", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().migration.clearMigration();

    expect(status).toBe(401);
  });

  test("POST /api/2.0/migration/clear - RoomAdmin cannot clear migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .migration.clearMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/clear - User cannot clear migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .migration.clearMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/clear - Guest cannot clear migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .migration.clearMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/migration/finish - permissions", () => {
  test("POST /api/2.0/migration/finish - Anonymous cannot finish migration", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .migration.finishMigration({ finishDto: { isSendWelcomeEmail: false } });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/migration/finish - RoomAdmin cannot finish migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .migration.finishMigration({ finishDto: { isSendWelcomeEmail: false } });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/finish - User cannot finish migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .migration.finishMigration({ finishDto: { isSendWelcomeEmail: false } });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/finish - Guest cannot finish migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .migration.finishMigration({ finishDto: { isSendWelcomeEmail: false } });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/migration/migrate - permissions", () => {
  test("POST /api/2.0/migration/migrate - Anonymous cannot start migration", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().migration.startMigration();

    expect(status).toBe(401);
  });

  test("POST /api/2.0/migration/migrate - RoomAdmin cannot start migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .migration.startMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/migrate - User cannot start migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .migration.startMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/migrate - Guest cannot start migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .migration.startMigration();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/migration/init/:migratorName - permissions", () => {
  test("POST /api/2.0/migration/init/:migratorName - Anonymous cannot initialize migration", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .migration.uploadAndInitializeMigration({ migratorName: "Nextcloud" });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/migration/init/:migratorName - RoomAdmin cannot initialize migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .migration.uploadAndInitializeMigration({ migratorName: "Nextcloud" });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/init/:migratorName - User cannot initialize migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .migration.uploadAndInitializeMigration({ migratorName: "Nextcloud" });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/migration/init/:migratorName - Guest cannot initialize migration", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .migration.uploadAndInitializeMigration({ migratorName: "Nextcloud" });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});
