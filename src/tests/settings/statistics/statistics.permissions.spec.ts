import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

const DOCUMENTS_MODULE_ID = "e67be73d-f9ae-4ce1-8fec-1880cb518cb4";

test.describe("GET /api/2.0/settings/statistics/spaceusage/:id - access control", () => {
  test("User (non-admin) cannot read the space usage statistics", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.statistics.getSpaceUsageStatistics({
      id: DOCUMENTS_MODULE_ID,
    });
    expect(status).toBe(403);
  });

  test("DocSpaceAdmin can read the space usage statistics", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.statistics.getSpaceUsageStatistics({
      id: DOCUMENTS_MODULE_ID,
    });
    expect(status).toBe(200);
  });

  test("Anonymous cannot read the space usage statistics", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .statistics.getSpaceUsageStatistics({ id: DOCUMENTS_MODULE_ID });
    expect(status).toBe(401);
  });
});
