import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  DistributedTaskStatus,
  DocumentBuilderTaskDto,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";

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
    expect(data.response).toBeDefined();
    expect(typeof (data.response as any).id).toBe("string");
    expect((data.response as any).id.length).toBeGreaterThan(0);
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
    expect(data.response).toBeDefined();
    expect(typeof (data.response as any).id).toBe("string");
    expect((data.response as any).id.length).toBeGreaterThan(0);
  });
});

/**
 * The half of the audit trail report that happens after the POST. The POST
 * only queues a build and hands back a job id, so everything the feature is
 * for - the file being written, the job being cancelled, one administrator's
 * report staying out of another's status - lives behind these two operations.
 *
 * Jobs are kept per caller and per report kind, which is why every check for
 * an empty status is paired with a positive control: without one, "nothing
 * here" is indistinguishable from "nothing was ever started".
 */
test.describe("GET /api/2.0/security/audit/events/report", () => {
  test("GET /api/2.0/security/audit/events/report - The report is built and its file lands in the caller's documents", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { status: createStatus } =
      await ownerApi.auditTrail.createAuditTrailReport();
    expect(createStatus).toBe(200);

    let finished: DocumentBuilderTaskDto | undefined;
    await expect(async () => {
      const { data, status } = await ownerApi.auditTrail.getAuditTrailReport();
      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.isCompleted).toBe(true);
      finished = data.response!;
    }).toPass({ intervals: [500, 1_000, 2_000, 5_000], timeout: 120_000 });

    expect(finished!.error).toBeFalsy();
    expect(finished!.percentage).toBe(100);
    expect(finished!.resultFileName).toMatch(/\.xlsx$/);

    // The status claims a file was written. This is the only check that the
    // file is really there and carries the name the status promised.
    const { data: file, status: fileStatus } = await ownerApi.files.getFileInfo(
      { fileId: finished!.resultFileId },
    );
    expect(fileStatus).toBe(200);
    expect(file.response!.title).toBe(finished!.resultFileName);
  });

  test("GET /api/2.0/security/audit/events/report - A caller with no report gets an empty answer", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.getAuditTrailReport();

    expect(status).toBe(200);
    // Nothing was started on this portal, and the absence is reported as an
    // empty answer rather than as an error.
    expect(data.response ?? null).toBeNull();
  });

  test("GET /api/2.0/security/audit/events/report - One administrator's report is not visible to another", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status: createStatus } =
      await adminApi.auditTrail.createAuditTrailReport();
    expect(createStatus).toBe(200);

    // The owner may read every audit event of the portal, and still somebody
    // else's report is not theirs to see.
    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.getAuditTrailReport();
    expect(status).toBe(200);
    expect(data.response ?? null).toBeNull();

    await test.step("while the administrator who started it still sees it", async () => {
      const { data: own } = await adminApi.auditTrail.getAuditTrailReport();
      expect(own.response).toBeDefined();
    });
  });
});

test.describe("DELETE /api/2.0/security/audit/events/report", () => {
  test("DELETE /api/2.0/security/audit/events/report - Cancelling after the report was built leaves its file alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.auditTrail.createAuditTrailReport();

    let built: DocumentBuilderTaskDto | undefined;
    await expect(async () => {
      const { data } = await ownerApi.auditTrail.getAuditTrailReport();
      expect(data.response).toBeDefined();
      expect(data.response!.status).toBe(DistributedTaskStatus.Completed);
      built = data.response!;
    }).toPass({ intervals: [500, 1_000, 2_000, 5_000], timeout: 120_000 });

    const { status } = await ownerApi.auditTrail.terminateAuditTrailReport();
    expect(status).toBe(200);

    // Cancelling is aimed at a build in progress. A report that is already
    // written is a file in the caller's documents like any other, and
    // cancelling must not reach back and take it away.
    const { data: file, status: fileStatus } = await ownerApi.files.getFileInfo(
      { fileId: built!.resultFileId },
    );
    expect(fileStatus).toBe(200);
    expect(file.response!.title).toBe(built!.resultFileName);
  });

  test("DELETE /api/2.0/security/audit/events/report - A cancelled report is eventually gone from the status", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.auditTrail.createAuditTrailReport();

    const { status } = await ownerApi.auditTrail.terminateAuditTrailReport();
    expect(status).toBe(200);

    // How long this takes depends on a race that cannot be steered from here,
    // and both of its outcomes end the same way, which is what makes the wait
    // safe to assert. A cancel that arrives before the build starts takes the
    // job straight out of the queue and the status is empty at once; a cancel
    // that catches a running build leaves the job behind in Canceled, because
    // it republishes its final state, and the queue drops it about a minute
    // later - measured at roughly 70 seconds, which is the queue's own minute
    // plus its ten-second sweep. The generous timeout is the point of this
    // test: shortening it to the bare minute brings back a job that is still
    // there and a failure that has nothing to do with the product.
    await expect(async () => {
      const { data } = await ownerApi.auditTrail.getAuditTrailReport();
      expect(data.response ?? null).toBeNull();
    }).toPass({ intervals: [2_000, 5_000, 10_000], timeout: 150_000 });
  });

  test("DELETE /api/2.0/security/audit/events/report - Cancelling when nothing is running is not an error", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { status } = await apiSdk
      .forRole("owner")
      .auditTrail.terminateAuditTrailReport();

    expect(status).toBe(200);
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

    let event: any;

    await expect(async () => {
      const result = await apiSdk
        .forRole("owner")
        .auditTrail.getAuditEventsByFilter();
      expect(result.status).toBe(200);
      expect(result.data.response!.length).toBeGreaterThan(0);
      event = result.data.response![0];
    }).toPass({ intervals: [1000, 2000, 3000, 5000], timeout: 30000 });

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

    let event: any;

    await expect(async () => {
      const result = await apiSdk
        .forRole("docSpaceAdmin")
        .auditTrail.getAuditEventsByFilter();
      expect(result.status).toBe(200);
      expect(result.data.response!.length).toBeGreaterThan(0);
      event = result.data.response![0];
    }).toPass({ intervals: [1000, 2000, 3000, 5000], timeout: 30000 });

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

test.describe("GET /api/2.0/security/audit/events/last", () => {
  test("GET /api/2.0/security/audit/events/last - Owner gets last audit events", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Last Audit Event Room",
        roomType: RoomType.CustomRoom,
      },
    });

    let event: any;

    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .auditTrail.getLastAuditEvents();

      expect(status).toBe(200);
      expect(data.response!.length).toBeGreaterThan(0);
      event = data.response![0];
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 15000 });

    expect(typeof event!.id).toBe("number");
    expect(typeof event!.userId).toBe("string");
    expect(typeof event!.user).toBe("string");
    expect(typeof event!.action).toBe("string");
    expect(typeof event!.actionId).toBe("number");
    expect(typeof event!.ip).toBe("string");
    expect(new Date(event!.date as string).getTime()).not.toBeNaN();
    expect(typeof event!.context).toBe("string");
  });

  test("GET /api/2.0/security/audit/events/last - DocSpaceAdmin gets last audit events", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk.forRole("owner").rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Last Audit Event Room",
        roomType: RoomType.CustomRoom,
      },
    });

    // Audit records are written behind the request, so the create above
    // reaches the log a moment later - as in the Owner variant.
    let event: any;

    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .auditTrail.getLastAuditEvents();

      expect(status).toBe(200);
      expect(data.response!.length).toBeGreaterThan(0);
      event = data.response![0];
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 15000 });

    expect(typeof event!.id).toBe("number");
    expect(typeof event!.userId).toBe("string");
    expect(typeof event!.user).toBe("string");
    expect(typeof event!.action).toBe("string");
    expect(typeof event!.actionId).toBe("number");
    expect(typeof event!.ip).toBe("string");
    expect(new Date(event!.date as string).getTime()).not.toBeNaN();
    expect(typeof event!.context).toBe("string");
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

test.describe("POST /api/2.0/security/audit/settings/lifetime", () => {
  test("POST /api/2.0/security/audit/settings/lifetime - Owner sets audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.setAuditSettings({
        tenantAuditSettingsRequestDto: {
          settings: {
            loginHistoryLifeTime: 180,
            auditTrailLifeTime: 180,
          },
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.loginHistoryLifeTime).toBe(180);
    expect((data as any).response?.auditTrailLifeTime).toBe(180);
    expect((data as any).response?.lastModified).toBeDefined();
  });

  test("POST /api/2.0/security/audit/settings/lifetime - DocSpaceAdmin sets audit settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .auditTrail.setAuditSettings({
        tenantAuditSettingsRequestDto: {
          settings: {
            loginHistoryLifeTime: 180,
            auditTrailLifeTime: 180,
          },
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.loginHistoryLifeTime).toBe(180);
    expect((data as any).response?.auditTrailLifeTime).toBe(180);
    expect((data as any).response?.lastModified).toBeDefined();
  });
});

test.describe("GET /api/2.0/security/audit/types", () => {
  test("GET /api/2.0/security/audit/types - Owner gets audit trail types", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .auditTrail.getAuditTrailTypes();

    expect(status).toBe(200);
    const response = (data as any).response;
    expect(response).toBeDefined();
    expect(Array.isArray(response.actions)).toBe(true);
    expect(response.actions.length).toBeGreaterThan(0);
    expect(Array.isArray(response.actionTypes)).toBe(true);
    expect(response.actionTypes.length).toBeGreaterThan(0);
    expect(Array.isArray(response.productTypes)).toBe(true);
    expect(response.productTypes.length).toBeGreaterThan(0);
    expect(Array.isArray(response.moduleTypes)).toBe(true);
    expect(response.moduleTypes.length).toBeGreaterThan(0);
    expect(Array.isArray(response.entryTypes)).toBe(true);
    expect(response.entryTypes.length).toBeGreaterThan(0);
    expect(response.actions).toContain("FileCreated");
    expect(response.productTypes).toContain("Documents");
  });

  test("GET /api/2.0/security/audit/types - DocSpaceAdmin gets audit trail types", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .auditTrail.getAuditTrailTypes();

    expect(status).toBe(200);
    const response = (data as any).response;
    expect(response).toBeDefined();
    expect(Array.isArray(response.actions)).toBe(true);
    expect(response.actions.length).toBeGreaterThan(0);
    expect(Array.isArray(response.actionTypes)).toBe(true);
    expect(Array.isArray(response.productTypes)).toBe(true);
    expect(Array.isArray(response.moduleTypes)).toBe(true);
    expect(Array.isArray(response.entryTypes)).toBe(true);
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
