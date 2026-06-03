import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/security/audit/events/report", () => {
  test("POST /api/2.0/security/audit/events/report - Owner generates audit trail report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.createAuditTrailReport();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response).toContain("/doceditor?fileid=");
  });

  test("POST /api/2.0/security/audit/events/report - DocSpaceAdmin generates audit trail report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .auditTrail.createAuditTrailReport();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(data.response).toContain("/doceditor?fileid=");
  });
});

test.describe("GET /api/2.0/security/audit/events/filter", () => {
  test("GET /api/2.0/security/audit/events/filter - Owner gets audit events list", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Audit Event Room",
        roomType: RoomType.CustomRoom,
      },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.getAuditEventsByFilter();

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
    expect(typeof event.context).toBe("string");
  });

  test("GET /api/2.0/security/audit/events/filter - DocSpaceAdmin gets audit events list", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk.forRole("owner").rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Audit Event Room",
        roomType: RoomType.CustomRoom,
      },
    });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .auditTrail.getAuditEventsByFilter();

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
    expect(typeof event.context).toBe("string");
  });
});

test.describe("GET /api/2.0/security/audit/settings/lifetime", () => {
  test("GET /api/2.0/security/audit/settings/lifetime - Owner gets audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.getAuditSettings();
    expect(status).toBe(200);
    expect(typeof (data as any).response?.loginHistoryLifeTime).toBe("number");
    expect(typeof (data as any).response?.auditTrailLifeTime).toBe("number");
    expect((data as any).response?.lastModified).toBeDefined();
  });

  test("GET /api/2.0/security/audit/settings/lifetime - DocSpaceAdmin gets audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .auditTrail.getAuditSettings();

    expect(status).toBe(200);
    expect(typeof (data as any).response?.loginHistoryLifeTime).toBe("number");
    expect(typeof (data as any).response?.auditTrailLifeTime).toBe("number");
  });
});

test.describe("GET /api/2.0/security/audit/mappers", () => {
  test("GET /api/2.0/security/audit/mappers - Owner gets audit trail mappers", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.getAuditTrailMappers();

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(typeof data.response).toBe("object");
  });

  test("GET /api/2.0/security/audit/mappers - DocSpaceAdmin gets audit trail mappers", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .auditTrail.getAuditTrailMappers();

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
  });
});
