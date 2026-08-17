import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

const PRODUCT_ID_ALL = "00000000-0000-0000-0000-000000000000";

test.describe("PUT /settings/security/administrator - access control", () => {
  test("BUG 80586: PUT /settings/security/administrator - DocSpace admin cannot demote another DocSpace admin", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment(4);

    const { data: admin2Data } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const admin2Id = admin2Data.response!.id!;

    const { api: admin1Api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await admin1Api.security.setProductAdministrator({
      securityRequestsDto: {
        productId: PRODUCT_ID_ALL,
        userId: admin2Id,
        administrator: false,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("PUT /settings/security/administrator - DocSpace admin cannot promote Room admin to DocSpace admin", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment(3);

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // DocSpace admin tries to promote Room admin to administrator — only Owner can do this
    const { data } = await adminApi.security.setProductAdministrator({
      securityRequestsDto: {
        productId: PRODUCT_ID_ALL,
        userId: roomAdminId,
        administrator: true,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });
});

test.describe("GET /api/2.0/settings/security/password - access control", () => {
  test("GET /api/2.0/settings/security/password - Anonymous cannot get password settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .security.getPasswordSettings();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/settings/security/password - access control", () => {
  test("PUT /api/2.0/settings/security/password - RoomAdmin cannot update password settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.security.updatePasswordSettings(
      { passwordSettingsRequestsDto: { minLength: 10 } },
    );

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/security/password - User cannot update password settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.security.updatePasswordSettings({
      passwordSettingsRequestsDto: { minLength: 10 },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/security/password - Guest cannot update password settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.security.updatePasswordSettings({
      passwordSettingsRequestsDto: { minLength: 10 },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/settings/security/security - access control", () => {
  test("GET /api/2.0/settings/security/security - Anonymous cannot get web-item security settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .security.getWebItemSettingsSecurityInfo();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/settings/security/security - access control", () => {
  test("PUT /api/2.0/settings/security/security - RoomAdmin cannot set a web item's security", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.security.setWebItemSecurity({
      webItemSecurityRequestsDto: { id: crypto.randomUUID(), enabled: false },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/security/security - User cannot set a web item's security", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.security.setWebItemSecurity({
      webItemSecurityRequestsDto: { id: crypto.randomUUID(), enabled: false },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/settings/security/security - Guest cannot set a web item's security", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.security.setWebItemSecurity({
      webItemSecurityRequestsDto: { id: crypto.randomUUID(), enabled: false },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/settings/security/access - access control", () => {
  test("PUT /api/2.0/settings/security/access - User cannot bulk-set access to web items", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.security.setAccessToWebItems({
      webItemsSecurityRequestsDto: {
        items: [{ key: crypto.randomUUID(), value: true }],
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/settings/security/modules - access control", () => {
  test("GET /api/2.0/settings/security/modules - Anonymous cannot get enabled modules", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().security.getEnabledModules();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/security/administrator/{productid} - access control", () => {
  test("GET /api/2.0/settings/security/administrator/{productid} - RoomAdmin cannot get product administrators", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.security.getProductAdministrators({
        productid: PRODUCT_ID_ALL,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/security/administrator/{productid} - User cannot get product administrators", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.security.getProductAdministrators({
      productid: PRODUCT_ID_ALL,
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/settings/security/administrator/{productid} - Guest cannot get product administrators", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.security.getProductAdministrators({
      productid: PRODUCT_ID_ALL,
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/settings/security/administrator - access control", () => {
  test("GET /api/2.0/settings/security/administrator - User cannot check a product administrator", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.security.getIsProductAdministrator({
      productid: PRODUCT_ID_ALL,
      userid: crypto.randomUUID(),
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});
