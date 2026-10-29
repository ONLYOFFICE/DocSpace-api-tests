import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// Per-module storage usage breakdown. Requires Owner/DocSpaceAdmin. Confirmed
// live: this DocSpace build has zero registered products in WebItemManager
// (same finding as the security/web-items domain - see security.spec.ts),
// so every module id - a real one or a made-up one - comes back as an empty
// list rather than an error, exactly as the SDK doc describes for an
// unknown module.
const DOCUMENTS_MODULE_ID = "e67be73d-f9ae-4ce1-8fec-1880cb518cb4";

test.describe("GET /api/2.0/settings/statistics/spaceusage/:id - Get the space usage statistics", () => {
  test("Owner gets an empty list for a real module id (no products registered on this build)", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .statistics.getSpaceUsageStatistics({ id: DOCUMENTS_MODULE_ID });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("Owner gets an empty list for a module id that doesn't exist, not an error", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .statistics.getSpaceUsageStatistics({
        id: "11111111-2222-3333-4444-555555555555",
      });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  // Contrast with the security/web-items domain, where a malformed id
  // crashes 3 of 4 endpoints with an unhandled 500 (BUG 83186/83187/83190):
  // here the id is bound as a typed Guid route parameter, so ASP.NET's own
  // model binding rejects a malformed id with a clean 404 before the
  // controller method ever runs - no bug here.
  test("Owner gets 404 for a malformed (non-GUID) id", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .statistics.getSpaceUsageStatistics({ id: "not-a-guid" });

    expect(status).toBe(404);
  });
});
