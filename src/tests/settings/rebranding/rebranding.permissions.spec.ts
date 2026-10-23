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

test.describe("PUT /api/2.0/settings/whitelabel/logos/restore - access control", () => {
  test("User (non-admin) cannot restore the white label logos", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.restoreWhiteLabelLogos();
    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/whitelabel/logos/save - access control", () => {
  test("User (non-admin) is refused before the plan check is even reached", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.saveWhiteLabelSettings({
      whiteLabelRequestsDto: { logo: [] },
    });
    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/whitelabel/logos/savefromfiles - access control", () => {
  test("User (non-admin) is refused before the plan check is even reached", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } =
      await userApi.rebranding.saveWhiteLabelSettingsFromFiles();
    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/rebranding/company - access control", () => {
  test("User (non-admin) cannot save the company white label settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.rebranding.saveCompanyWhiteLabelSettings({
      companyWhiteLabelSettingsWrapper: {
        settings: {
          companyName: "Autotest Co",
          site: "https://example.com",
          email: "autotest@example.com",
          address: "Autotest address",
          phone: "+10000000000",
        },
      },
    });
    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/rebranding/additional - access control", () => {
  test("User (non-admin) cannot save the additional white label settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } =
      await userApi.rebranding.saveAdditionalWhiteLabelSettings({
        additionalWhiteLabelSettingsWrapper: {
          settings: {
            startDocsEnabled: false,
            helpCenterEnabled: false,
            feedbackAndSupportEnabled: false,
            userForumEnabled: false,
            videoGuidesEnabled: false,
            licenseAgreementsEnabled: false,
          },
        },
      });
    expect(status).toBe(403);
  });
});

test.describe("DELETE /api/2.0/settings/rebranding/company - access control", () => {
  test("User (non-admin) cannot delete the company white label settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } =
      await userApi.rebranding.deleteCompanyWhiteLabelSettings();
    expect(status).toBe(403);
  });
});

test.describe("DELETE /api/2.0/settings/rebranding/additional - access control", () => {
  test("User (non-admin) cannot delete the additional white label settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } =
      await userApi.rebranding.deleteAdditionalWhiteLabelSettings();
    expect(status).toBe(403);
  });
});

test.describe("Mutating rebranding endpoints - Anonymous access control", () => {
  // Every save/restore/delete call refuses an unauthenticated caller with 401,
  // same as the read endpoints above - checked together here since it's the
  // same claim repeated across every mutating method, rather than one test
  // per endpoint as the role-based checks above do.
  test("Anonymous cannot call any save, restore or delete rebranding endpoint", async ({
    apiSdk,
  }) => {
    const anon = apiSdk.forAnonymous();

    const saveLogoText = await anon.rebranding.saveWhiteLabelLogoText({
      whiteLabelRequestsDto: { logoText: "x" },
    });
    expect(saveLogoText.status).toBe(401);

    const saveLogos = await anon.rebranding.saveWhiteLabelSettings({
      whiteLabelRequestsDto: { logo: [] },
    });
    expect(saveLogos.status).toBe(401);

    const saveLogosFromFiles =
      await anon.rebranding.saveWhiteLabelSettingsFromFiles();
    expect(saveLogosFromFiles.status).toBe(401);

    const restoreLogoText = await anon.rebranding.restoreWhiteLabelLogoText();
    expect(restoreLogoText.status).toBe(401);

    const restoreLogos = await anon.rebranding.restoreWhiteLabelLogos();
    expect(restoreLogos.status).toBe(401);

    const saveCompany = await anon.rebranding.saveCompanyWhiteLabelSettings({
      companyWhiteLabelSettingsWrapper: {
        settings: {
          companyName: "x",
          site: "https://example.com",
          email: "a@example.com",
          address: "a",
          phone: "1",
        },
      },
    });
    expect(saveCompany.status).toBe(401);

    const saveAdditional =
      await anon.rebranding.saveAdditionalWhiteLabelSettings({
        additionalWhiteLabelSettingsWrapper: {
          settings: {
            startDocsEnabled: false,
            helpCenterEnabled: false,
            feedbackAndSupportEnabled: false,
            userForumEnabled: false,
            videoGuidesEnabled: false,
            licenseAgreementsEnabled: false,
          },
        },
      });
    expect(saveAdditional.status).toBe(401);

    const deleteCompany =
      await anon.rebranding.deleteCompanyWhiteLabelSettings();
    expect(deleteCompany.status).toBe(401);

    const deleteAdditional =
      await anon.rebranding.deleteAdditionalWhiteLabelSettings();
    expect(deleteAdditional.status).toBe(401);
  });
});
