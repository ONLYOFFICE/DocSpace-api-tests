import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("POST /api/2.0/security/audit/login/report - permissions", () => {
  test("POST /api/2.0/security/audit/login/report - Anonymous cannot create login history report", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .loginHistory.createLoginHistoryReport();

    expect(status).toBe(401);
  });

  test("POST /api/2.0/security/audit/login/report - RoomAdmin cannot create login history report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .loginHistory.createLoginHistoryReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/audit/login/report - User cannot create login history report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .loginHistory.createLoginHistoryReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/audit/login/report - Guest cannot create login history report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .loginHistory.createLoginHistoryReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/security/audit/login/last - permissions", () => {
  test("GET /api/2.0/security/audit/login/last - Anonymous cannot get last login events", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .loginHistory.getLastLoginEvents();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/security/audit/login/last - RoomAdmin cannot get last login events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .loginHistory.getLastLoginEvents();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/login/last - User cannot get last login events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .loginHistory.getLastLoginEvents();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/login/last - Guest cannot get last login events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .loginHistory.getLastLoginEvents();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/security/audit/login/filter - permissions", () => {
  test("GET /api/2.0/security/audit/login/filter - Anonymous cannot filter login events", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .loginHistory.getLoginEventsByFilter();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/security/audit/login/filter - RoomAdmin cannot filter login events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .loginHistory.getLoginEventsByFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/login/filter - User cannot filter login events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .loginHistory.getLoginEventsByFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/login/filter - Guest cannot filter login events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .loginHistory.getLoginEventsByFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});
