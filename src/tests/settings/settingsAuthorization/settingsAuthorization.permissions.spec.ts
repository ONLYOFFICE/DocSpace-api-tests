import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { s3AuthServiceDto, invalidMysqlSettings } from "@/src/helpers/auth-services";

test.describe("GET /api/2.0/settings/authservice - permissions", () => {
  test("GET /api/2.0/settings/authservice - Anonymous cannot get auth services", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .settingsAuthorization.getAuthServices();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/authservice - RoomAdmin cannot get auth services", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .settingsAuthorization.getAuthServices();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/authservice - User cannot get auth services", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .settingsAuthorization.getAuthServices();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/authservice - Guest cannot get auth services", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .settingsAuthorization.getAuthServices();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/settings/authservice - permissions", () => {
  test("POST /api/2.0/settings/authservice - Anonymous cannot save auth keys", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .settingsAuthorization.saveAuthKeys({
        authServiceRequestsDto: s3AuthServiceDto,
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/authservice - RoomAdmin cannot save auth keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .settingsAuthorization.saveAuthKeys({
        authServiceRequestsDto: s3AuthServiceDto,
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/authservice - User cannot save auth keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .settingsAuthorization.saveAuthKeys({
        authServiceRequestsDto: s3AuthServiceDto,
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/authservice - Guest cannot save auth keys", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .settingsAuthorization.saveAuthKeys({
        authServiceRequestsDto: s3AuthServiceDto,
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/settings/authservice/externaldb/test - permissions", () => {
  test("POST /api/2.0/settings/authservice/externaldb/test - Anonymous cannot test external database connection", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .settingsAuthorization.testExternalDatabaseConnection({
        externalDatabaseSettings: invalidMysqlSettings,
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/authservice/externaldb/test - RoomAdmin cannot test external database connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .settingsAuthorization.testExternalDatabaseConnection({
        externalDatabaseSettings: invalidMysqlSettings,
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/authservice/externaldb/test - User cannot test external database connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .settingsAuthorization.testExternalDatabaseConnection({
        externalDatabaseSettings: invalidMysqlSettings,
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/authservice/externaldb/test - Guest cannot test external database connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .settingsAuthorization.testExternalDatabaseConnection({
        externalDatabaseSettings: invalidMysqlSettings,
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});
