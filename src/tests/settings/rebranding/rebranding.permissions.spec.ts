import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/rebranding/company - access control", () => {
  test("User (non-admin) can read the company white label settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.getCompanyWhiteLabelSettings();
    expect(status).toBe(200);
  });

  test("Anonymous cannot read the company white label settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .rebranding.getCompanyWhiteLabelSettings();
    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/rebranding/additional - access control", () => {
  test("User (non-admin) can read the additional white label settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } =
      await userApi.rebranding.getAdditionalWhiteLabelSettings();
    expect(status).toBe(200);
  });

  test("Anonymous cannot read the additional white label settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .rebranding.getAdditionalWhiteLabelSettings();
    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/companywhitelabel - access control", () => {
  test("User (non-admin) can read the licensor data", async ({ apiSdk }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.getLicensorData();
    expect(status).toBe(200);
  });

  test("Anonymous cannot read the licensor data", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().rebranding.getLicensorData();
    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/whitelabel/logos - access control", () => {
  test("Anonymous can read the white label logos - no authentication needed", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .rebranding.getWhiteLabelLogos();
    expect(status).toBe(200);
  });
});

test.describe("GET /api/2.0/settings/enablewhitelabel - access control", () => {
  test("DocSpaceAdmin can check the white label availability", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.rebranding.getEnableWhitelabel();
    expect(status).toBe(200);
  });

  test("User (non-admin) cannot check the white label availability", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.getEnableWhitelabel();
    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/whitelabel/logos/isdefault - access control", () => {
  test("User (non-admin) cannot check the default white label logos", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.getIsDefaultWhiteLabelLogos();
    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/whitelabel/logotext - access control", () => {
  test("User (non-admin) cannot read the white label logo text", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.getWhiteLabelLogoText();
    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/whitelabel/logotext/isdefault - access control", () => {
  test("User (non-admin) cannot check the default logo text", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } =
      await userApi.rebranding.getIsDefaultWhiteLabelLogoText();
    expect(status).toBe(403);
  });
});

test.describe("PUT /api/2.0/settings/whitelabel/logotext/restore - access control", () => {
  test("User (non-admin) cannot restore the white label logo text", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.restoreWhiteLabelLogoText();
    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/whitelabel/logotext/save - access control", () => {
  test("User (non-admin) is refused before the plan check is even reached", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.saveWhiteLabelLogoText({
      whiteLabelRequestsDto: { logoText: "Autotest Brand" },
    });
    expect(status).toBe(403);
  });
});
