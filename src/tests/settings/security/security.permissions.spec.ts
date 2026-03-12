import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

const PRODUCT_ID_ALL = "00000000-0000-0000-0000-000000000000";

test.describe("PUT /settings/security/administrator - access control", () => {
  test("PUT /settings/security/administrator - DocSpace admin cannot demote another DocSpace admin", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment(4);

    const { data: admin2Data } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const admin2Id = admin2Data.response!.id!;

    const { api: admin1Api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // DocSpace admin tries to demote another DocSpace admin — only Owner can do this
    const { data } = await admin1Api.security.setProductAdministrator({
      productId: PRODUCT_ID_ALL,
      userId: admin2Id,
      administrator: false,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("PUT /settings/security/administrator - DocSpace admin cannot promote Room admin to DocSpace admin", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment(3);

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // DocSpace admin tries to promote Room admin to administrator — only Owner can do this
    const { data } = await adminApi.security.setProductAdministrator({
      productId: PRODUCT_ID_ALL,
      userId: roomAdminId,
      administrator: true,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });
});
