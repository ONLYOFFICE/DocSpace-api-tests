import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import config from "@/config";

test.describe("POST /api/2.0/security/audit/events/report - permissions", () => {
  test("POST /api/2.0/security/audit/events/report - Anonymous cannot create audit trail report", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .auditTrail.createAuditTrailReport();

    expect(status).toBe(401);
  });

  test("POST /api/2.0/security/audit/events/report - RoomAdmin cannot create audit trail report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .auditTrail.createAuditTrailReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/audit/events/report - User cannot create audit trail report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .auditTrail.createAuditTrailReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/audit/events/report - Guest cannot create audit trail report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .auditTrail.createAuditTrailReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/audit/events/report - Owner cannot create report on unpaid portal", async ({
    apiSdk,
  }) => {
    test.fail(
      !!config.LOCAL_PORTAL_DOMAIN,
      "Payment checks are not enforced on local instances",
    );

    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.createAuditTrailReport();

    expect(status).toBe(402);
    expect(data.statusCode).toBe(402);
    expect((data as any).error?.message).toBe(
      "Your pricing plan does not support this option",
    );
  });

  test("POST /api/2.0/security/audit/events/report - DocSpaceAdmin cannot create report on unpaid portal", async ({
    apiSdk,
  }) => {
    test.fail(
      !!config.LOCAL_PORTAL_DOMAIN,
      "Payment checks are not enforced on local instances",
    );

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .auditTrail.createAuditTrailReport();

    expect(status).toBe(402);
    expect(data.statusCode).toBe(402);
    expect((data as any).error?.message).toBe(
      "Your pricing plan does not support this option",
    );
  });
});

test.describe("GET /api/2.0/security/audit/events/last - permissions", () => {
  test("GET /api/2.0/security/audit/events/last - Anonymous cannot get last audit events", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .auditTrail.getLastAuditEvents();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/security/audit/events/last - RoomAdmin cannot get last audit events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .auditTrail.getLastAuditEvents();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/events/last - User cannot get last audit events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .auditTrail.getLastAuditEvents();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/events/last - Guest cannot get last audit events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .auditTrail.getLastAuditEvents();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/security/audit/events/filter - permissions", () => {
  test("GET /api/2.0/security/audit/events/filter - Anonymous cannot get audit events", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .auditTrail.getAuditEventsByFilter();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/security/audit/events/filter - RoomAdmin cannot get audit events", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .auditTrail.getAuditEventsByFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/events/filter - User cannot get audit events", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .auditTrail.getAuditEventsByFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/events/filter - Guest cannot get audit events", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .auditTrail.getAuditEventsByFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/security/audit/settings/lifetime - permissions", () => {
  test("POST /api/2.0/security/audit/settings/lifetime - Anonymous cannot set audit settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().auditTrail.setAuditSettings({
      tenantAuditSettingsWrapper: {
        settings: { loginHistoryLifeTime: 180, auditTrailLifeTime: 180 },
      },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/security/audit/settings/lifetime - RoomAdmin cannot set audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .auditTrail.setAuditSettings({
        tenantAuditSettingsWrapper: {
          settings: { loginHistoryLifeTime: 180, auditTrailLifeTime: 180 },
        },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/audit/settings/lifetime - User cannot set audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .auditTrail.setAuditSettings({
        tenantAuditSettingsWrapper: {
          settings: { loginHistoryLifeTime: 180, auditTrailLifeTime: 180 },
        },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/security/audit/settings/lifetime - Guest cannot set audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .auditTrail.setAuditSettings({
        tenantAuditSettingsWrapper: {
          settings: { loginHistoryLifeTime: 180, auditTrailLifeTime: 180 },
        },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/security/audit/settings/lifetime - permissions", () => {
  test("GET /api/2.0/security/audit/settings/lifetime - Anonymous cannot get audit settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .auditTrail.getAuditSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/security/audit/settings/lifetime - RoomAdmin cannot get audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .auditTrail.getAuditSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/settings/lifetime - User cannot get audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .auditTrail.getAuditSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/settings/lifetime - Guest cannot get audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .auditTrail.getAuditSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/security/audit/types - permissions", () => {
  test("GET /api/2.0/security/audit/types - Anonymous cannot get audit trail types", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .auditTrail.getAuditTrailTypes();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/security/audit/types - RoomAdmin cannot get audit trail types", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .auditTrail.getAuditTrailTypes();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/types - User cannot get audit trail types", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .auditTrail.getAuditTrailTypes();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/security/audit/types - Guest cannot get audit trail types", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .auditTrail.getAuditTrailTypes();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/security/audit/mappers - permissions", () => {
  test("BUG 81861: GET /api/2.0/security/audit/mappers - Anonymous cannot get audit trail mappers", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .auditTrail.getAuditTrailMappers();

    expect(status).toBe(401);
  });

  test("BUG 81861: GET /api/2.0/security/audit/mappers - RoomAdmin cannot get audit trail mappers", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .auditTrail.getAuditTrailMappers();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("BUG 81861: GET /api/2.0/security/audit/mappers - User cannot get audit trail mappers", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .auditTrail.getAuditTrailMappers();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("BUG 81861: GET /api/2.0/security/audit/mappers - Guest cannot get audit trail mappers", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .auditTrail.getAuditTrailMappers();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});
