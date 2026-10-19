import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// Rebranding/white-label settings. Two gates sit in front of the mutating
// calls, confirmed live and distinct from each other:
// - a payment gate ("pricing plan does not support this option", 402) on the
//   four whitelabel/logo(s) save calls, driven by GET /settings/enablewhitelabel
//   (false on this test environment - no branding in the plan);
// - a server-installation gate ("Access denied", 403, via
//   DemandAccessSpacePermissionAsync) on the four rebranding/company+additional
//   save/delete calls, which this SaaS test environment never satisfies
//   regardless of plan - the docs call it out explicitly ("on a SaaS portal
//   the call is refused").
// The restore operations (logos/logotext) are gated by neither and succeed
// here as Owner.
//
// Confirmed live: `paymentsApi.setupPayment()` (the same helper AI tests use
// to unlock their own paid features) also flips this portal's plan to one
// that includes branding - `GET /settings/enablewhitelabel` goes from false
// to true, and the three payment-gated save calls succeed. The SaaS
// space-access gate above is independent of this and stays refused either
// way, confirmed live too.

test.describe("GET /api/2.0/settings/enablewhitelabel", () => {
  test("Owner checks whether branding is available", async ({ apiSdk }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.getEnableWhitelabel();

    expect(status).toBe(200);
    // Reflects this portal's plan, not a portal-independent constant - false
    // here because the test plan does not include branding (see note above).
    expect(data.response).toBe(false);
  });
});

test.describe("GET /api/2.0/settings/rebranding/company - Get company white label settings", () => {
  test("Owner gets the built-in ONLYOFFICE company details", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.getCompanyWhiteLabelSettings();

    expect(status).toBe(200);
    expect(data.response).toEqual(
      expect.objectContaining({
        companyName: "Ascensio System SIA",
        site: "https://www.onlyoffice.com",
        isLicensor: true,
        isDefault: true,
      }),
    );
  });
});

test.describe("GET /api/2.0/settings/rebranding/additional - Get additional white label settings", () => {
  test("Owner gets the built-in resource flags, all enabled by default", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.getAdditionalWhiteLabelSettings();

    expect(status).toBe(200);
    expect(data.response).toEqual(
      expect.objectContaining({
        startDocsEnabled: true,
        helpCenterEnabled: true,
        feedbackAndSupportEnabled: true,
        userForumEnabled: true,
        videoGuidesEnabled: true,
        licenseAgreementsEnabled: true,
        isDefault: true,
      }),
    );
  });
});

test.describe("GET /api/2.0/settings/companywhitelabel - Get licensor data", () => {
  test("Owner gets a single-item list of the built-in ONLYOFFICE licensor", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.getLicensorData();

    expect(status).toBe(200);
    expect(data.response).toHaveLength(1);
    expect(data.response![0]).toEqual(
      expect.objectContaining({
        companyName: "Ascensio System SIA",
        IsLicensor: true,
      }),
    );
  });
});

test.describe("GET /api/2.0/settings/whitelabel/logos - Get white label logos", () => {
  test("Anonymous gets the default logo slots without authentication", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forAnonymous()
      .rebranding.getWhiteLabelLogos();

    expect(status).toBe(200);
    // The notification slot is derived from the login-page logo and is
    // deliberately left out of this list (unlike .../logos/isdefault below).
    expect(data.response).toHaveLength(15);
    expect(data.response!.map((l) => l.name)).not.toContain("Notification");
  });
});

test.describe("GET /api/2.0/settings/whitelabel/logos/isdefault - Check the default white label logos", () => {
  test("Owner sees every slot still on the built-in image, including notification", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.getIsDefaultWhiteLabelLogos();

    expect(status).toBe(200);
    expect(data.response).toHaveLength(16);
    expect(data.response!.map((l) => l.name)).toContain("Notification");
    for (const slot of data.response!) {
      expect(slot.default).toBe(true);
    }
  });
});

test.describe("GET /api/2.0/settings/whitelabel/logotext - Get the white label logo text", () => {
  test("Owner gets the built-in ONLYOFFICE wordmark", async ({ apiSdk }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.getWhiteLabelLogoText();

    expect(status).toBe(200);
    expect(data.response).toBe("ONLYOFFICE");
  });
});

test.describe("GET /api/2.0/settings/whitelabel/logotext/isdefault - Check the default logo text", () => {
  test("Owner sees the wordmark is still the built-in one", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.getIsDefaultWhiteLabelLogoText();

    expect(status).toBe(200);
    expect(data.response).toEqual(
      expect.objectContaining({ name: "logotext", default: true }),
    );
  });
});

test.describe("PUT /api/2.0/settings/whitelabel/logotext/restore - Restore the white label logo text", () => {
  test("Owner restores the wordmark - safe to call with nothing stored", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.restoreWhiteLabelLogoText();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });
});

test.describe("PUT /api/2.0/settings/whitelabel/logos/restore - Restore the white label logos", () => {
  test("Owner restores the logos - safe to call with nothing stored", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .rebranding.restoreWhiteLabelLogos();

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });
});

test.describe("POST /api/2.0/settings/whitelabel/logotext/save - Save the white label logo text", () => {
  test("Owner is refused as payment required on a plan without branding", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rebranding.saveWhiteLabelLogoText({
        whiteLabelRequestsDto: { logoText: "Autotest Brand" },
      });

    expect(status).toBe(402);
  });

  test("Owner saves a custom wordmark once the plan includes branding", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.rebranding.saveWhiteLabelLogoText({
      whiteLabelRequestsDto: { logoText: "Autotest Brand" },
    });
    expect(status).toBe(200);

    const { data: readBack } =
      await ownerApi.rebranding.getWhiteLabelLogoText();
    expect(readBack.response).toBe("Autotest Brand");

    const { data: isDefault } =
      await ownerApi.rebranding.getIsDefaultWhiteLabelLogoText();
    expect(isDefault.response?.default).toBe(false);
  });
});

test.describe("POST /api/2.0/settings/whitelabel/logos/save - Save the white label logos", () => {
  test("Owner is refused as payment required on a plan without branding", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rebranding.saveWhiteLabelSettings({
        whiteLabelRequestsDto: { logo: [] },
      });

    expect(status).toBe(402);
  });

  test("Owner saves a custom logo once the plan includes branding", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    // A 1x1 PNG - the endpoint only cares that it decodes as an image.
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

    const { status } = await ownerApi.rebranding.saveWhiteLabelSettings({
      whiteLabelRequestsDto: {
        logo: [{ key: "1", value: { light: tinyPng } }],
      },
    });
    expect(status).toBe(200);

    const { data: isDefaultLogos } =
      await ownerApi.rebranding.getIsDefaultWhiteLabelLogos();
    const savedSlot = isDefaultLogos.response!.find(
      (l) => l.name === "LightSmall",
    );
    expect(savedSlot?.default).toBe(false);
  });
});

test.describe("POST /api/2.0/settings/whitelabel/logos/savefromfiles - Save the logos from files", () => {
  test("Owner is refused when the request carries no file", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rebranding.saveWhiteLabelSettingsFromFiles();

    expect(status).toBe(403);
  });

  test("Owner saves a logo from an uploaded file once the plan includes branding", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    // Not callable through the typed SDK method (it takes no body param for
    // the actual multipart payload) - same raw-axios pattern as uploadFileToFolder.
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const formData = new FormData();
    formData.append(
      "1.png",
      new Blob([new Uint8Array(pngBytes)], { type: "image/png" }),
      "1.png",
    );

    const axiosInstance = apiSdk.createAxiosInstance();
    const response = await axiosInstance.post(
      `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/settings/whitelabel/logos/savefromfiles`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
          Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
        },
      },
    );
    expect(response.status).toBe(200);

    const { data: isDefaultLogos } = await apiSdk
      .forRole("owner")
      .rebranding.getIsDefaultWhiteLabelLogos();
    const savedSlot = isDefaultLogos.response!.find(
      (l) => l.name === "LightSmall",
    );
    expect(savedSlot?.default).toBe(false);
  });
});

test.describe("POST /api/2.0/settings/rebranding/company - Save the company white label settings", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rebranding.saveCompanyWhiteLabelSettings({
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

test.describe("POST /api/2.0/settings/rebranding/additional - Save the additional white label settings", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rebranding.saveAdditionalWhiteLabelSettings({
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

test.describe("DELETE /api/2.0/settings/rebranding/company - Delete the company white label settings", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rebranding.deleteCompanyWhiteLabelSettings();

    expect(status).toBe(403);
  });
});

test.describe("DELETE /api/2.0/settings/rebranding/additional - Delete the additional white label settings", () => {
  test("Owner is refused on a SaaS portal (no unrestricted space access)", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .rebranding.deleteAdditionalWhiteLabelSettings();

    expect(status).toBe(403);
  });
});
