import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// NOTE: tests with enable: true are intentionally skipped — enabling IP restrictions
// without adding the test runner's IP would block portal access and break cleanup.
// To cover that scenario, set TEST_RUNNER_IP in env and add it to the restrictions list.

test.describe("GET /api/2.0/settings/iprestrictions", () => {
  test("GET /api/2.0/settings/iprestrictions - Owner gets IP restrictions", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .ipRestrictions.getIpRestrictions();

    console.log("Owner response:", JSON.stringify(data.response, null, 2));

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/settings/iprestrictions - DocSpaceAdmin gets IP restrictions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .ipRestrictions.getIpRestrictions();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("GET /api/2.0/settings/iprestrictions/settings", () => {
  test("GET /api/2.0/settings/iprestrictions/settings - Owner gets IP restriction settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .ipRestrictions.readIpRestrictionsSettings();

    expect(status).toBe(200);
    expect(typeof (data.response as any).enable).toBe("boolean");
    expect(
      Number.isNaN(new Date((data.response as any).lastModified).getTime()),
    ).toBe(false);
  });

  test("GET /api/2.0/settings/iprestrictions/settings - DocSpaceAdmin gets IP restriction settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .ipRestrictions.readIpRestrictionsSettings();

    expect(status).toBe(200);
  });
});

test.describe("PUT /api/2.0/settings/iprestrictions", () => {
  test("PUT /api/2.0/settings/iprestrictions - Owner saves IP restrictions with enable: false", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .ipRestrictions.saveIpRestrictions({
        ipRestrictionsDto: {
          ipRestrictions: [{ ip: "192.168.1.1", forAdmin: false }],
          enable: false,
        },
      });

    expect(status).toBe(200);
    expect((data.response as any).enable).toBe(false);
    expect(Array.isArray((data.response as any).ipRestrictions)).toBe(true);
    expect((data.response as any).ipRestrictions[0].ip).toBe("192.168.1.1");
    expect((data.response as any).ipRestrictions[0].forAdmin).toBe(false);
  });

  test("PUT /api/2.0/settings/iprestrictions - DocSpaceAdmin saves IP restrictions with enable: false", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .ipRestrictions.saveIpRestrictions({
        ipRestrictionsDto: {
          ipRestrictions: [{ ip: "192.168.1.1", forAdmin: false }],
          enable: false,
        },
      });

    expect(status).toBe(200);
  });
});

test.describe("PUT /api/2.0/settings/iprestrictions/settings", () => {
  test("PUT /api/2.0/settings/iprestrictions/settings - Owner disables IP restriction settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .ipRestrictions.updateIpRestrictionsSettings({
        ipRestrictionsDto: {
          ipRestrictions: null,
          enable: false,
        },
      });

    expect(status).toBe(200);
    expect((data.response as any).enable).toBe(false);
    expect(Array.isArray((data.response as any).ipRestrictions)).toBe(true);
  });

  test("PUT /api/2.0/settings/iprestrictions/settings - DocSpaceAdmin disables IP restriction settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .ipRestrictions.updateIpRestrictionsSettings({
        ipRestrictionsDto: {
          ipRestrictions: null,
          enable: false,
        },
      });

    expect(status).toBe(200);
  });
});
