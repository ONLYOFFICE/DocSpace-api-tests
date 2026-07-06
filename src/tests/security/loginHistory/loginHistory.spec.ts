import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { MessageAction } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/security/audit/login/report", () => {
  test("POST /api/2.0/security/audit/login/report - Owner creates login history report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .loginHistory.createLoginHistoryReport();

    expect(status).toBe(200);
    expect(typeof data.response).toBe("string");
    expect(data.response).toContain("doceditor");
  });

  test("POST /api/2.0/security/audit/login/report - DocSpaceAdmin creates login history report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .loginHistory.createLoginHistoryReport();

    expect(status).toBe(200);
    expect(typeof data.response).toBe("string");
    expect(data.response).toContain("doceditor");
  });
});

test.describe("GET /api/2.0/security/audit/login/last", () => {
  test("GET /api/2.0/security/audit/login/last - Owner gets last login events", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .loginHistory.getLastLoginEvents();

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);

    const event = data.response![0];
    expect(typeof event.id).toBe("number");
    expect(typeof event.userId).toBe("string");
    expect(typeof event.user).toBe("string");
    expect(typeof event.action).toBe("string");
    expect(typeof event.actionId).toBe("number");
    expect(typeof event.ip).toBe("string");
    expect(new Date(event.date as string).getTime()).not.toBeNaN();
  });

  test("GET /api/2.0/security/audit/login/last - DocSpaceAdmin gets last login events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .loginHistory.getLastLoginEvents();

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);

    const event = data.response![0];
    expect(typeof event.id).toBe("number");
    expect(typeof event.userId).toBe("string");
    expect(typeof event.user).toBe("string");
    expect(typeof event.action).toBe("string");
    expect(typeof event.actionId).toBe("number");
    expect(typeof event.ip).toBe("string");
    expect(new Date(event.date as string).getTime()).not.toBeNaN();
  });

  test("GET /api/2.0/security/audit/login/last - Owner sees login events for all user types", async ({
    apiSdk,
  }) => {
    const docAdmin = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const roomAdmin = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const user = await apiSdk.addAuthenticatedMember("owner", "User");

    const memberIds = [
      docAdmin.data.response?.id,
      roomAdmin.data.response?.id,
      user.data.response?.id,
    ];

    const { data, status } = await apiSdk
      .forRole("owner")
      .loginHistory.getLastLoginEvents();

    expect(status).toBe(200);

    const eventUserIds = data.response!.map((e) => e.userId);
    for (const memberId of memberIds) {
      expect(eventUserIds).toContain(memberId);
    }
  });

  test("GET /api/2.0/security/audit/login/last - DocSpaceAdmin sees login events for all user types", async ({
    apiSdk,
  }) => {
    const docAdmin = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const roomAdmin = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const user = await apiSdk.addAuthenticatedMember("owner", "User");

    const memberIds = [
      docAdmin.data.response?.id,
      roomAdmin.data.response?.id,
      user.data.response?.id,
    ];

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .loginHistory.getLastLoginEvents();

    expect(status).toBe(200);

    const eventUserIds = data.response!.map((e) => e.userId);
    for (const memberId of memberIds) {
      expect(eventUserIds).toContain(memberId);
    }
  });
});

test.describe("GET /api/2.0/security/audit/login/filter", () => {
  test("GET /api/2.0/security/audit/login/filter - Owner filters login events by userId", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = memberData.response!.id!;

    const { data, status } = await apiSdk
      .forRole("owner")
      .loginHistory.getLoginEventsByFilter({ userId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    const eventUserIds = data.response!.map((e) => e.userId);
    expect(eventUserIds).toContain(userId);
  });

  test("GET /api/2.0/security/audit/login/filter - Owner filters login events by action", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .loginHistory.getLoginEventsByFilter({
        action: MessageAction.LoginSuccess,
      });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/security/audit/login/filter - Owner filters login events with count pagination", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .loginHistory.getLoginEventsByFilter({ count: 1 });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(1);
  });

  test("GET /api/2.0/security/audit/login/filter - DocSpaceAdmin filters login events by userId", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = memberData.response!.id!;

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .loginHistory.getLoginEventsByFilter({ userId });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    const eventUserIds = data.response!.map((e) => e.userId);
    expect(eventUserIds).toContain(userId);
  });
});
