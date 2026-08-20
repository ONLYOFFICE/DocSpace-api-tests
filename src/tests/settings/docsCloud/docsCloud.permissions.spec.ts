import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("POST /api/2.0/settings/docscloud/tenant/quota/report - permissions", () => {
  test("POST /api/2.0/settings/docscloud/tenant/quota/report - RoomAdmin cannot create tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.createTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/tenant/quota/report - User cannot create tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.createTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/tenant/quota/report - Guest cannot create tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.createTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/tenant/quota/report - Anonymous cannot create tenant quota report", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .docsCloud.createTenantQuotaReport();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/quota/report - permissions", () => {
  test("GET /api/2.0/settings/docscloud/tenant/quota/report - RoomAdmin cannot get tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.getTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/quota/report - User cannot get tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.getTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/quota/report - Guest cannot get tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.getTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/quota/report - Anonymous cannot get tenant quota report", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .docsCloud.getTenantQuotaReport();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/info - permissions", () => {
  test("GET /api/2.0/settings/docscloud/tenant/info - RoomAdmin cannot get tenant info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.getTenantInfo();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/info - User cannot get tenant info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.getTenantInfo();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/info - Guest cannot get tenant info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.getTenantInfo();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/info - Anonymous cannot get tenant info", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().docsCloud.getTenantInfo();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/config - permissions", () => {
  test("GET /api/2.0/settings/docscloud/tenant/config - RoomAdmin cannot get tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.getTenantConfig();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/config - User cannot get tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.getTenantConfig();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/config - Guest cannot get tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.getTenantConfig();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/config - Anonymous cannot get tenant config", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().docsCloud.getTenantConfig();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant - permissions", () => {
  test("GET /api/2.0/settings/docscloud/tenant - RoomAdmin cannot get DocsCloud tenant", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.getTenant();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant - User cannot get DocsCloud tenant", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk.forRole("user").docsCloud.getTenant();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant - Guest cannot get DocsCloud tenant", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.getTenant();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant - Anonymous cannot get DocsCloud tenant", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().docsCloud.getTenant();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/quota - permissions", () => {
  test("GET /api/2.0/settings/docscloud/tenant/quota - RoomAdmin cannot get tenant quota", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.getTenantQuota();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/quota - User cannot get tenant quota", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.getTenantQuota();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/quota - Guest cannot get tenant quota", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.getTenantQuota();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/quota - Anonymous cannot get tenant quota", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().docsCloud.getTenantQuota();

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/settings/docscloud/calculatedevpack - permissions", () => {
  test("POST /api/2.0/settings/docscloud/calculatedevpack - RoomAdmin cannot calculate DevPack cost", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.calculateDevPack({
        docsCloudDevPackRequestDto: { quantity: 1 },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/calculatedevpack - User cannot calculate DevPack cost", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.calculateDevPack({
        docsCloudDevPackRequestDto: { quantity: 1 },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/calculatedevpack - Guest cannot calculate DevPack cost", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.calculateDevPack({
        docsCloudDevPackRequestDto: { quantity: 1 },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/calculatedevpack - Anonymous cannot calculate DevPack cost", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().docsCloud.calculateDevPack({
      docsCloudDevPackRequestDto: { quantity: 1 },
    });

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/settings/docscloud/switchtodevpack - permissions", () => {
  test("POST /api/2.0/settings/docscloud/switchtodevpack - RoomAdmin cannot switch to DevPack", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.switchToDevPack({
        docsCloudDevPackRequestDto: { quantity: 1 },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/switchtodevpack - User cannot switch to DevPack", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.switchToDevPack({
        docsCloudDevPackRequestDto: { quantity: 1 },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/switchtodevpack - Guest cannot switch to DevPack", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.switchToDevPack({
        docsCloudDevPackRequestDto: { quantity: 1 },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/switchtodevpack - Anonymous cannot switch to DevPack", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().docsCloud.switchToDevPack({
      docsCloudDevPackRequestDto: { quantity: 1 },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/settings/docscloud/tenant/config - permissions", () => {
  test("PUT /api/2.0/settings/docscloud/tenant/config - RoomAdmin cannot update tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.updateTenantConfig({
        docsCloudConfig: { wopi: { enable: true } },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/docscloud/tenant/config - User cannot update tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.updateTenantConfig({
        docsCloudConfig: { wopi: { enable: true } },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/docscloud/tenant/config - Guest cannot update tenant config", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.updateTenantConfig({
        docsCloudConfig: { wopi: { enable: true } },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/docscloud/tenant/config - Anonymous cannot update tenant config", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .docsCloud.updateTenantConfig({
        docsCloudConfig: { wopi: { enable: true } },
      });

    expect(status).toBe(401);
  });
});

test.describe("DELETE /api/2.0/settings/docscloud/tenant/quota/report - permissions", () => {
  test("DELETE /api/2.0/settings/docscloud/tenant/quota/report - RoomAdmin cannot terminate tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.terminateTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/settings/docscloud/tenant/quota/report - User cannot terminate tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.terminateTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/settings/docscloud/tenant/quota/report - Guest cannot terminate tenant quota report", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.terminateTenantQuotaReport();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/settings/docscloud/tenant/quota/report - Anonymous cannot terminate tenant quota report", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .docsCloud.terminateTenantQuotaReport();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/docscloud/tenant/usage - permissions", () => {
  test("GET /api/2.0/settings/docscloud/tenant/usage - RoomAdmin cannot get tenant usage", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.getTenantUsage();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/usage - User cannot get tenant usage", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.getTenantUsage();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/usage - Guest cannot get tenant usage", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.getTenantUsage();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/docscloud/tenant/usage - Anonymous cannot get tenant usage", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().docsCloud.getTenantUsage();

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/settings/docscloud/trial - permissions", () => {
  test("POST /api/2.0/settings/docscloud/trial - RoomAdmin cannot start DocsCloud trial", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .docsCloud.startDocsCloudTrial();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/trial - User cannot start DocsCloud trial", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .docsCloud.startDocsCloudTrial();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/trial - Guest cannot start DocsCloud trial", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .docsCloud.startDocsCloudTrial();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/docscloud/trial - Anonymous cannot start DocsCloud trial", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .docsCloud.startDocsCloudTrial();

    expect(status).toBe(401);
  });
});
