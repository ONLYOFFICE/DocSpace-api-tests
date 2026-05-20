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
