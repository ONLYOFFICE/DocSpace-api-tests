import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("POST /api/2.0/settings/docscloud/tenant/quota/report", () => {
  test("POST /api/2.0/settings/docscloud/tenant/quota/report - Owner creates tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.createTenantQuotaReport();

    expect(status).toBe(200);
    const task = data.response!;
    expect(typeof task.id).toBe("string");
    expect(task.id!.length).toBeGreaterThan(0);
    expect(task.error).toBe("");
    expect(task.isCompleted).toBe(false);
    expect(task.percentage).toBe(0);
    expect(task.status).toBe(0);
    expect((task as any).resultFileId).toBe(0);
  });

  test("POST /api/2.0/settings/docscloud/tenant/quota/report - DocSpaceAdmin creates tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.createTenantQuotaReport();

    expect(status).toBe(200);
    const task = data.response!;
    expect(typeof task.id).toBe("string");
    expect(task.id!.length).toBeGreaterThan(0);
    expect(task.error).toBe("");
    expect(task.isCompleted).toBe(false);
    expect(task.percentage).toBe(0);
    expect(task.status).toBe(0);
    expect((task as any).resultFileId).toBe(0);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/quota/report", () => {
  test("GET /api/2.0/settings/docscloud/tenant/quota/report - Owner gets completed quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();
    await apiSdk.forRole("owner").docsCloud.createTenantQuotaReport();

    let task: any;
    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .docsCloud.getTenantQuotaReport();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      task = data.response;
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 60000 });

    expect(task.error).toBe("");
    expect(task.percentage).toBe(100);
    expect(task.status).toBe(2);
    expect((task as any).resultFileId).toBeGreaterThan(0);
    expect(typeof (task as any).resultFileName).toBe("string");
    expect((task as any).resultFileName.length).toBeGreaterThan(0);
    expect(typeof (task as any).resultFileUrl).toBe("string");
  });

  test("GET /api/2.0/settings/docscloud/tenant/quota/report - DocSpaceAdmin gets completed quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();
    await apiSdk.forRole("docSpaceAdmin").docsCloud.createTenantQuotaReport();

    let task: any;
    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .docsCloud.getTenantQuotaReport();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      task = data.response;
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 60000 });

    expect(task.error).toBe("");
    expect(task.percentage).toBe(100);
    expect(task.status).toBe(2);
    expect((task as any).resultFileId).toBeGreaterThan(0);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/config", () => {
  test("GET /api/2.0/settings/docscloud/tenant/config - Owner gets tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.getTenantConfig();

    expect(status).toBe(200);
    const config = data.response!;
    expect(typeof config.tenantName).toBe("string");
    expect(config.security).toBeDefined();
    expect((config.security as any).secret.length).toBeGreaterThan(0);
    expect((config.security as any).header.length).toBeGreaterThan(0);
    expect(config.server).toBeDefined();
    expect((config.server as any).fileSizeLimit).toBeGreaterThan(0);
    expect(config.wopi).toBeDefined();
    expect(config.ipFilter).toBeDefined();
  });

  test("GET /api/2.0/settings/docscloud/tenant/config - DocSpaceAdmin gets tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.getTenantConfig();

    expect(status).toBe(200);
    const config = data.response!;
    expect((config.security as any).secret.length).toBeGreaterThan(0);
    expect((config.security as any).header.length).toBeGreaterThan(0);
    expect((config.server as any).fileSizeLimit).toBeGreaterThan(0);
    expect(config.wopi).toBeDefined();
    expect(config.ipFilter).toBeDefined();
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/info", () => {
  test("GET /api/2.0/settings/docscloud/tenant/info - Owner gets tenant info", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.getTenantInfo();

    expect(status).toBe(200);
    const info = data.response as any;
    expect(new Date(info.license.valid).getTime()).not.toBeNaN();
    expect(new Date(info.license.buildDate).getTime()).not.toBeNaN();
    expect(info.license.trial).toBe(true);
    expect(info.server.version.length).toBeGreaterThan(0);
    expect(info.server.packageType.length).toBeGreaterThan(0);
    expect(info.usersLimit.edit).toBe(1000);
    expect(info.usersLimit.view).toBe(1000);
    expect(info.stats.periodDay).toBe(30);
    expect(info.stats.editor).toBeDefined();
    expect(info.stats.viewer).toBeDefined();
  });

  test("GET /api/2.0/settings/docscloud/tenant/info - DocSpaceAdmin gets tenant info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.getTenantInfo();

    expect(status).toBe(200);
    const info = data.response as any;
    expect(new Date(info.license.valid).getTime()).not.toBeNaN();
    expect(new Date(info.license.buildDate).getTime()).not.toBeNaN();
    expect(info.license.trial).toBe(true);
    expect(info.server.version.length).toBeGreaterThan(0);
    expect(info.server.packageType.length).toBeGreaterThan(0);
    expect(info.usersLimit.edit).toBe(1000);
    expect(info.usersLimit.view).toBe(1000);
    expect(info.stats.periodDay).toBe(30);
    expect(info.stats.editor).toBeDefined();
    expect(info.stats.viewer).toBeDefined();
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/quota", () => {
  test("GET /api/2.0/settings/docscloud/tenant/quota - Owner gets tenant quota", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.getTenantQuota();

    expect(status).toBe(200);
    const quota = data.response as any;
    expect(Array.isArray(quota.users)).toBe(true);
    expect(Array.isArray(quota.usersView)).toBe(true);
  });

  test("GET /api/2.0/settings/docscloud/tenant/quota - DocSpaceAdmin gets tenant quota", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.getTenantQuota();

    expect(status).toBe(200);
    const quota = data.response as any;
    expect(Array.isArray(quota.users)).toBe(true);
    expect(Array.isArray(quota.usersView)).toBe(true);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/info - negative", () => {
  test.fail(
    "BUG XXXXX: GET /api/2.0/settings/docscloud/tenant/info - returns 500 instead of 400 when DocsCloud tenant is not activated",
    async ({ apiSdk }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .docsCloud.getTenantInfo();

      expect(status).toBe(400);
      expect((data as any).error?.message).toBe("DocsCloud resource not found");
    },
  );
});

test.describe("GET /api/2.0/settings/docscloud/tenant/usage", () => {
  test("GET /api/2.0/settings/docscloud/tenant/usage - Owner gets tenant usage", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.getTenantUsage();

    expect(status).toBe(200);
    const usage = data.response as any;
    expect(new Date(usage.since).getTime()).not.toBeNaN();
    expect(typeof usage.activeCount).toBe("number");
  });

  test("GET /api/2.0/settings/docscloud/tenant/usage - DocSpaceAdmin gets tenant usage", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.getTenantUsage();

    expect(status).toBe(200);
    const usage = data.response as any;
    expect(new Date(usage.since).getTime()).not.toBeNaN();
    expect(typeof usage.activeCount).toBe("number");
  });
});

test.describe("PUT /api/2.0/settings/docscloud/tenant/config", () => {
  test("PUT /api/2.0/settings/docscloud/tenant/config - Owner updates tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const secret = apiSdk.faker.generateString(16);
    const header = apiSdk.faker.generateString(16);

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.updateTenantConfig({
        docsCloudConfig: {
          security: { secret, header },
          wopi: { enable: true },
          server: { isAnonymousSupport: false, fileSizeLimit: 209715200 },
          ipFilter: { rules: [{ address: "1.1.1.1", allowed: false }] },
        },
      });

    expect(status).toBe(200);
    const config = data.response!;
    expect(config.security?.secret).toBe(secret);
    expect(config.security?.header).toBe(header);
    expect(config.wopi?.enable).toBe(true);
    expect(config.server?.isAnonymousSupport).toBe(false);
    expect(config.server?.fileSizeLimit).toBe(209715200);
    expect(config.ipFilter?.rules?.[0]?.address).toBe("1.1.1.1");
    expect(config.ipFilter?.rules?.[0]?.allowed).toBe(false);
  });

  test("PUT /api/2.0/settings/docscloud/tenant/config - DocSpaceAdmin updates tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const secret = apiSdk.faker.generateString(16);
    const header = apiSdk.faker.generateString(16);

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.updateTenantConfig({
        docsCloudConfig: {
          security: { secret, header },
          wopi: { enable: true },
          server: { isAnonymousSupport: false, fileSizeLimit: 209715200 },
          ipFilter: { rules: [{ address: "1.1.1.1", allowed: false }] },
        },
      });

    expect(status).toBe(200);
    const config = data.response!;
    expect(config.security?.secret).toBe(secret);
    expect(config.security?.header).toBe(header);
    expect(config.wopi?.enable).toBe(true);
    expect(config.server?.isAnonymousSupport).toBe(false);
    expect(config.server?.fileSizeLimit).toBe(209715200);
    expect(config.ipFilter?.rules?.[0]?.address).toBe("1.1.1.1");
    expect(config.ipFilter?.rules?.[0]?.allowed).toBe(false);
  });
});

test.describe("POST /api/2.0/settings/docscloud/calculatedevpack", () => {
  test("POST /api/2.0/settings/docscloud/calculatedevpack - Owner calculates DevPack cost", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(1000);
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { docscloud: 1 },
        productQuantityType: 1,
      },
    });
    await paymentsApi.refreshPaymentInfo();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.calculateDevPack({
        docsCloudDevPackRequestDto: { quantity: 10 },
      });

    expect(status).toBe(200);
    const calc = data.response!;
    expect(typeof calc.operationId).toBe("number");
    expect(typeof calc.amount).toBe("number");
    expect(typeof calc.currency).toBe("USD");
    expect(calc.currency!.length).toBeGreaterThan(0);
    expect(calc.quantity).toBe(10);
  });

  test("POST /api/2.0/settings/docscloud/calculatedevpack - DocSpaceAdmin calculates DevPack cost", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(1000);
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { docscloud: 1 },
        productQuantityType: 1,
      },
    });
    await paymentsApi.refreshPaymentInfo();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.calculateDevPack({
        docsCloudDevPackRequestDto: { quantity: 10 },
      });

    expect(status).toBe(200);
    const calc = data.response!;
    expect(typeof calc.operationId).toBe("number");
    expect(typeof calc.amount).toBe("number");
    expect(typeof calc.currency).toBe("USD");
    expect(calc.currency!.length).toBeGreaterThan(0);
    expect(calc.quantity).toBe(10);
  });
});

test.describe("POST /api/2.0/settings/docscloud/switchtodevpack", () => {
  test("POST /api/2.0/settings/docscloud/switchtodevpack - Owner switches to DevPack", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(1000);
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { docscloud: 1 },
        productQuantityType: 1,
      },
    });
    await paymentsApi.refreshPaymentInfo();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.switchToDevPack({
        docsCloudDevPackRequestDto: { quantity: 10 },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("POST /api/2.0/settings/docscloud/switchtodevpack - DocSpaceAdmin switches to DevPack", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(1000);
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { docscloud: 1 },
        productQuantityType: 1,
      },
    });
    await paymentsApi.refreshPaymentInfo();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.switchToDevPack({
        docsCloudDevPackRequestDto: { quantity: 10 },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });
});

test.describe("PUT /api/2.0/settings/docscloud/tenant/config - string length validation", () => {
  test.fail(
    "BUG XXXXX: PUT /api/2.0/settings/docscloud/tenant/config - tenantName is not validated for length",
    async ({ apiSdk }) => {
      await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

      const { status } = await apiSdk
        .forRole("owner")
        .docsCloud.updateTenantConfig({
          docsCloudConfig: {
            tenantName: apiSdk.faker.generateString(256),
          },
        });

      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG XXXXX: PUT /api/2.0/settings/docscloud/tenant/config - security.secret is not validated for length",
    async ({ apiSdk }) => {
      await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

      const { status } = await apiSdk
        .forRole("owner")
        .docsCloud.updateTenantConfig({
          docsCloudConfig: {
            security: { secret: apiSdk.faker.generateString(256) },
          },
        });

      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG XXXXX: PUT /api/2.0/settings/docscloud/tenant/config - security.header is not validated for length",
    async ({ apiSdk }) => {
      await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

      const { status } = await apiSdk
        .forRole("owner")
        .docsCloud.updateTenantConfig({
          docsCloudConfig: {
            security: { header: apiSdk.faker.generateString(256) },
          },
        });

      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG XXXXX: PUT /api/2.0/settings/docscloud/tenant/config - ipFilter.rules[].address is not validated for length",
    async ({ apiSdk }) => {
      await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

      const { status } = await apiSdk
        .forRole("owner")
        .docsCloud.updateTenantConfig({
          docsCloudConfig: {
            ipFilter: {
              rules: [
                { address: apiSdk.faker.generateString(256), allowed: true },
              ],
            },
          },
        });

      expect(status).toBe(400);
    },
  );
});

test.describe("PUT /api/2.0/settings/docscloud/tenant/config - server.fileSizeLimit validation", () => {
  test.fail(
    "BUG XXXXX: PUT /api/2.0/settings/docscloud/tenant/config - returns 500 instead of 400 when server.fileSizeLimit is too large",
    async ({ apiSdk }) => {
      await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

      const { status } = await apiSdk
        .forRole("owner")
        .docsCloud.updateTenantConfig({
          docsCloudConfig: {
            server: { fileSizeLimit: 9999999999 },
          },
        });

      expect(status).toBe(400);
    },
  );
});

test.describe("DELETE /api/2.0/settings/docscloud/tenant/quota/report", () => {
  test("DELETE /api/2.0/settings/docscloud/tenant/quota/report - Owner terminates tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();
    await apiSdk.forRole("owner").docsCloud.createTenantQuotaReport();

    const { status } = await apiSdk
      .forRole("owner")
      .docsCloud.terminateTenantQuotaReport();

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/settings/docscloud/tenant/quota/report - DocSpaceAdmin terminates tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();
    await apiSdk.forRole("docSpaceAdmin").docsCloud.createTenantQuotaReport();

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.terminateTenantQuotaReport();

    expect(status).toBe(200);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/usage - negative", () => {
  test.fail(
    "BUG XXXXX: GET /api/2.0/settings/docscloud/tenant/usage - returns 500 instead of 400 when DocsCloud tenant is not activated",
    async ({ apiSdk }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .docsCloud.getTenantUsage();

      expect(status).toBe(400);
      expect((data as any).error?.message).toBe("DocsCloud resource not found");
    },
  );
});

test.describe("GET /api/2.0/settings/docscloud/tenant/quota - negative", () => {
  test.fail(
    "BUG XXXXX: GET /api/2.0/settings/docscloud/tenant/quota - returns 500 instead of 400 when DocsCloud tenant is not activated",
    async ({ apiSdk }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .docsCloud.getTenantQuota();

      expect(status).toBe(400);
      expect((data as any).error?.message).toBe("DocsCloud resource not found");
    },
  );
});

test.describe("GET /api/2.0/settings/docscloud/tenant/config - negative", () => {
  test.fail(
    "BUG XXXXX: GET /api/2.0/settings/docscloud/tenant/config - returns 500 instead of 400 when DocsCloud tenant is not activated",
    async ({ apiSdk }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .docsCloud.getTenantConfig();

      expect(status).toBe(400);
      expect((data as any).error?.message).toBe("DocsCloud resource not found");
    },
  );
});

test.describe("GET /api/2.0/settings/docscloud/tenant", () => {
  test("GET /api/2.0/settings/docscloud/tenant - Owner gets DocsCloud tenant", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.getTenant();

    expect(status).toBe(200);
    const tenant = data.response!;
    expect(typeof tenant.dedicatedResourceExId).toBe("number");
    expect(typeof tenant.alias).toBe("string");
    expect(typeof tenant.customerId).toBe("string");
    expect(typeof tenant.endDate).toBe("string");
    expect(new Date(tenant.endDate!).getTime()).not.toBeNaN();
    expect(typeof tenant.isActive).toBe("boolean");
    expect(typeof tenant.address).toBe("string");
    expect(tenant.payment).toBeDefined();
  });

  test("GET /api/2.0/settings/docscloud/tenant - DocSpaceAdmin gets DocsCloud tenant", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.getTenant();

    expect(status).toBe(200);
    const tenant = data.response!;
    expect(typeof tenant.dedicatedResourceExId).toBe("number");
    expect(typeof tenant.alias).toBe("string");
    expect(typeof tenant.isActive).toBe("boolean");
    expect(tenant.payment).toBeDefined();
  });
});

test.describe("POST /api/2.0/settings/docscloud/trial", () => {
  test("POST /api/2.0/settings/docscloud/trial - Owner starts DocsCloud trial", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.startDocsCloudTrial();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("POST /api/2.0/settings/docscloud/trial - DocSpaceAdmin starts DocsCloud trial", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .docsCloud.startDocsCloudTrial();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("POST /api/2.0/settings/docscloud/trial - returns 400 when DocsCloud trial is already active", async ({
    apiSdk,
  }) => {
    await apiSdk.forRole("owner").docsCloud.startDocsCloudTrial();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.startDocsCloudTrial();

    expect(status).toBe(400);
    expect((data as any).error?.message).toBe("Quota is already set");
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant - when not activated", () => {
  test("GET /api/2.0/settings/docscloud/tenant - returns 200 with empty response when DocsCloud tenant is not activated", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.getTenant();

    expect(status).toBe(200);
    expect(data.response).toBeUndefined();
    expect((data as any).count).toBe(0);
  });
});

test.describe("PUT /api/2.0/settings/docscloud/tenant/config - negative", () => {
  test.fail(
    "BUG XXXXX: PUT /api/2.0/settings/docscloud/tenant/config - returns 500 instead of 400 when DocsCloud tenant is not activated",
    async ({ apiSdk }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .docsCloud.updateTenantConfig({
          docsCloudConfig: { wopi: { enable: true } },
        });

      expect(status).toBe(400);
      expect((data as any).error?.message).toBe("DocsCloud resource not found");
    },
  );
});

test.describe("POST /api/2.0/settings/docscloud/calculatedevpack - negative", () => {
  test("POST /api/2.0/settings/docscloud/calculatedevpack - returns 400 when DocsCloud subscription is not active", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .docsCloud.calculateDevPack({
        docsCloudDevPackRequestDto: { quantity: 10 },
      });

    expect(status).toBe(400);
    expect((data as any).error?.message).toBe(
      "DocsCloud subscription is not active",
    );
  });
});
