import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// SAML Single Sign-On configuration. Confirmed live: every method is behind
// the same payment/plan gate already seen on RebrandingApi/StorageApi (402
// "pricing plan does not support this option", driven by the portal's
// tariff), except getSsoSettingsV2Constants, which is static reference data
// available to any authenticated caller regardless of plan.
//
// `saveSsoSettingsV2` takes its whole configuration as `serializeSettings`,
// a JSON string - NOT a nested object - so the payload is
// `{ serializeSettings: JSON.stringify({ idpSettings, fieldMapping, ... }) }`.

const VALID_FIELD_MAPPING = {
  firstName: "givenName",
  lastName: "sn",
  email: "mail",
};
const VALID_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";

function validSsoSettings(overrides: Record<string, unknown> = {}) {
  return {
    idpSettings: {
      entityId: "https://idp.example.com/entity",
      ssoUrl: "https://idp.example.com/sso",
      ssoBinding: VALID_BINDING,
    },
    fieldMapping: VALID_FIELD_MAPPING,
    ...overrides,
  };
}

test.describe("GET /api/2.0/settings/ssov2/default - Get the default SSO settings", () => {
  test("Owner is refused as payment required on a plan without SSO", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .sso.getDefaultSsoSettingsV2();

    expect(status).toBe(402);
  });

  test("Owner gets the built-in template once the plan includes SSO", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .sso.getDefaultSsoSettingsV2();

    expect(status).toBe(200);
    expect(data.response?.enableSso).toBe(false);
    expect(data.response?.idpSettings?.entityId).toBe("");
    expect(data.response?.spLoginLabel).toBe("Single Sign-on");
  });
});

test.describe("GET /api/2.0/settings/ssov2/constants - Get the SSO settings constants", () => {
  test("Owner gets the SAML field constants even without a plan that includes SSO", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .sso.getSsoSettingsV2Constants();

    expect(status).toBe(200);
    expect(data.response?.ssoBindingType).toEqual(
      expect.objectContaining({ saml20HttpPost: expect.any(String) }),
    );
  });
});

test.describe("GET /api/2.0/settings/ssov2 - Get the SSO settings", () => {
  test("Owner is refused as payment required on a plan without SSO", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").sso.getSsoSettingsV2();

    expect(status).toBe(402);
  });

  test("Anonymous gets only the fields the sign-in page needs, not the full configuration", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk.forAnonymous().sso.getSsoSettingsV2();

    expect(status).toBe(200);
    expect(data.response?.hideAuthPage).toBeDefined();
    expect(data.response?.idpSettings).toBeUndefined();
    expect(data.response?.spLoginLabel).toBeUndefined();
  });
});

test.describe("POST /api/2.0/settings/ssov2 - Save the SSO settings", () => {
  test("Owner is refused as payment required on a plan without SSO", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").sso.saveSsoSettingsV2({
      ssoSettingsRequestsDto: {
        serializeSettings: JSON.stringify(validSsoSettings()),
      },
    });

    expect(status).toBe(402);
  });

  test("Owner saves a valid SAML configuration once the plan includes SSO", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.sso.saveSsoSettingsV2({
      ssoSettingsRequestsDto: {
        serializeSettings: JSON.stringify(
          validSsoSettings({
            enableSso: true,
            spLoginLabel: "Custom SSO Label",
          }),
        ),
      },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.sso.getSsoSettingsV2();
    expect(data.response?.enableSso).toBe(true);
    expect(data.response?.idpSettings?.entityId).toBe(
      "https://idp.example.com/entity",
    );
    expect(data.response?.spLoginLabel).toBe("Custom SSO Label");
  });

  test("Owner's login label longer than 100 characters is cut to 100, not refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.sso.saveSsoSettingsV2({
      ssoSettingsRequestsDto: {
        serializeSettings: JSON.stringify(
          validSsoSettings({ spLoginLabel: "L".repeat(150) }),
        ),
      },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.sso.getSsoSettingsV2();
    expect(data.response?.spLoginLabel).toHaveLength(100);
  });

  test("Owner's unrecognized usersType value is normalized to 4 (user)", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.sso.saveSsoSettingsV2({
      ssoSettingsRequestsDto: {
        serializeSettings: JSON.stringify(validSsoSettings({ usersType: 99 })),
      },
    });
    expect(status).toBe(200);

    const { data } = await ownerApi.sso.getSsoSettingsV2();
    expect(data.response?.usersType).toBe(4);
  });

  test("An empty serializeSettings string is refused with 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { status } = await apiSdk.forRole("owner").sso.saveSsoSettingsV2({
      ssoSettingsRequestsDto: { serializeSettings: "" },
    });

    expect(status).toBe(400);
  });

  // Three bugs, same shape: the SDK doc states a well-formed 400 validation
  // error for each of these missing/malformed required fields, but the
  // handler actually throws a raw (unhandled in the entityId/ssoUrl/mapping
  // cases, truly unhandled NullReferenceException when fieldMapping is left
  // out entirely) C# exception that the global error handler turns into a
  // 500, leaking a full .NET stack trace to the client. Filed as BUG TBD,
  // BUG TBD, BUG TBD - same root cause (validation not mapped to a 400
  // response) but three independent code paths, one per field.

  test.fail(
    "BUG TBD: missing entityId crashes with 500 instead of a validation error",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();

      const { status } = await apiSdk.forRole("owner").sso.saveSsoSettingsV2({
        ssoSettingsRequestsDto: {
          serializeSettings: JSON.stringify(
            validSsoSettings({
              idpSettings: {
                ssoUrl: "https://idp.example.com/sso",
                ssoBinding: VALID_BINDING,
              },
            }),
          ),
        },
      });

      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG TBD: missing ssoUrl crashes with 500 instead of a validation error",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();

      const { status } = await apiSdk.forRole("owner").sso.saveSsoSettingsV2({
        ssoSettingsRequestsDto: {
          serializeSettings: JSON.stringify(
            validSsoSettings({
              idpSettings: {
                entityId: "https://idp.example.com/entity",
                ssoBinding: VALID_BINDING,
              },
            }),
          ),
        },
      });

      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG TBD: an incomplete field mapping crashes with 500 instead of a validation error",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();

      const { status } = await apiSdk.forRole("owner").sso.saveSsoSettingsV2({
        ssoSettingsRequestsDto: {
          serializeSettings: JSON.stringify(
            validSsoSettings({
              fieldMapping: { firstName: "a", lastName: "b" },
            }),
          ),
        },
      });

      expect(status).toBe(400);
    },
  );
});

test.describe("DELETE /api/2.0/settings/ssov2 - Reset the SSO settings", () => {
  test("Owner is refused as payment required on a plan without SSO", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").sso.resetSsoSettingsV2();

    expect(status).toBe(402);
  });

  test("Owner resets a saved configuration back to the built-in defaults", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.sso.saveSsoSettingsV2({
      ssoSettingsRequestsDto: {
        serializeSettings: JSON.stringify(
          validSsoSettings({ enableSso: true }),
        ),
      },
    });

    const { status } = await ownerApi.sso.resetSsoSettingsV2();
    expect(status).toBe(200);

    const { data } = await ownerApi.sso.getSsoSettingsV2();
    expect(data.response?.enableSso).toBe(false);
    expect(data.response?.idpSettings?.entityId).toBe("");
  });
});
