import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { TfaRequestsDtoType } from "@onlyoffice/docspace-api-sdk";
import { enableTfaApp, linkTfaApp, resetTfaAfterTest } from "@/src/helpers/tfa";
import config from "@/config";

test.afterEach(async ({ apiSdk }) => {
  await resetTfaAfterTest(apiSdk);
});

test.describe("PUT /api/2.0/settings/tfaapp - Owner updates TFA settings", () => {
  test("PUT /api/2.0/settings/tfaapp - Owner enables TFA App", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/settings/tfaapp - Owner disables TFA", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.None },
      });

    expect(status).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  // Docs: PUT /settings/tfaapp returns 405 "SMS settings are not available"
  // when no SMS provider is configured. Live API returns 403 instead.
  test.fail(
    "BUG 82970: PUT /api/2.0/settings/tfaapp - should return 405 when no SMS provider is configured, but API returns 403",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestsDto: { type: TfaRequestsDtoType.Sms },
        });

      expect(status).toBe(405);
    },
  );
});

test.describe("PUT /api/2.0/settings/tfaapp - Owner sends invalid field values", () => {
  test("PUT /api/2.0/settings/tfaapp - an out-of-range type is ignored, not applied", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: 99 as TfaRequestsDtoType },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/settings/tfaapp - a non-existent mandatoryUsers id is ignored, not applied", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: {
          type: TfaRequestsDtoType.None,
          mandatoryUsers: ["00000000-0000-0000-0000-000000000000"],
        },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/settings/tfaapp - a non-existent mandatoryGroups id is ignored, not applied", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: {
          type: TfaRequestsDtoType.None,
          mandatoryGroups: ["00000000-0000-0000-0000-000000000000"],
        },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/settings/tfaapp - a malformed mandatoryUsers id is rejected with a validation error", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: {
          type: TfaRequestsDtoType.None,
          mandatoryUsers: ["not-a-guid"],
        },
      });

    expect(status).toBe(400);
    expect(
      (data as any).response?.errors?.["$.mandatoryUsers[0]"],
    ).toBeTruthy();
  });

  // BUG 82994: a malformed trustedIps entry is accepted with no format
  // validation (200) and stored as-is. Every subsequent login attempt by any
  // user on the portal then crashes with 500 (System.FormatException) when
  // TfaEnabledForUserAsync tries to parse it as an IP. Confirmed: strings with
  // no IP shape at all (e.g. "not-an-ip") crash it; a numeric-but-out-of-range
  // string ("999.999.999.999") does not. Also confirmed via the web UI login
  // form - same crash, same unhandled exception message shown to the user.
  //
  // This test's portal can't be cleaned up afterwards: resetTfaAfterTest's own
  // recovery login hits the exact same crash, since the bad trustedIps entry
  // is still there. That's the bug demonstrating itself, not a regression.
  test.fail(
    "BUG 82994: a malformed trustedIps entry should be rejected or ignored, not crash every subsequent login with 500",
    async ({ apiSdk }) => {
      const enable = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettings({
          tfaRequestsDto: {
            type: TfaRequestsDtoType.App,
            trustedIps: ["not-an-ip"],
          },
        });
      expect(enable.status).toBe(200);

      const { status } = await apiSdk
        .forRole("owner")
        .authentication.authenticateMe({
          authRequestsDto: {
            userName: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            session: true,
          },
        });

      expect(status).toBe(200);
    },
  );
});

test.describe("PUT /api/2.0/settings/tfaapp - DocSpaceAdmin updates TFA settings", () => {
  test("PUT /api/2.0/settings/tfaapp - DocSpaceAdmin enables TFA App", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/settings/tfaapp - DocSpaceAdmin disables TFA", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .tfaSettings.updateTfaSettings({
        tfaRequestsDto: { type: TfaRequestsDtoType.None },
      });

    expect(status).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });
});

test.describe("GET /api/2.0/settings/tfaapp - Owner gets TFA settings", () => {
  test("GET /api/2.0/settings/tfaapp - Owner gets the list of TFA configurations", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.getTfaSettings();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    for (const entry of data.response!) {
      expect(typeof entry.enabled).toBe("boolean");
      expect(typeof entry.available).toBe("boolean");
    }
  });
});

test.describe("PUT /api/2.0/settings/tfaapp - Enabling TFA App invalidates the current session", () => {
  test("PUT /api/2.0/settings/tfaapp - Owner's own token stops working right after enabling TFA App", async ({
    apiSdk,
  }) => {
    await enableTfaApp(apiSdk, "owner");

    const { status } = await apiSdk
      .forRole("owner")
      .tfaSettings.getTfaSettings();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/tfaapp/setup - Owner generates a TFA app setup code", () => {
  // Docs: 405 "TFA application settings are not available" when TFA App is
  // disabled. Live API returns 403 instead - here with an empty body, unlike
  // the other doc-mismatch cases below, which return the exception message.
  test.fail(
    "BUG 82972: GET /api/2.0/settings/tfaapp/setup - should return 405 while TFA App is disabled, but API returns 403",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.tfaAppGenerateSetupCode();

      expect(status).toBe(405);
    },
  );

  // Confirmed via manual browser testing: re-generating a setup code for an
  // already-linked account works fine through the web UI's cookie session.
  // Over a Bearer token it consistently 403s regardless of role or TFA state -
  // this endpoint isn't reachable through this API-only test harness.
  test("GET /api/2.0/settings/tfaapp/setup - Regenerating a setup code via a Bearer token is rejected even for an already-linked account", async ({
    apiSdk,
  }) => {
    await linkTfaApp(apiSdk, "owner");

    const { status } = await apiSdk
      .forRole("owner")
      .tfaSettings.tfaAppGenerateSetupCode();

    expect(status).toBe(403);
  });
});

test.describe("PUT /api/2.0/settings/tfaappwithlink - Owner updates TFA settings and gets a confirmation link", () => {
  test("PUT /api/2.0/settings/tfaappwithlink - Owner enables TFA App and receives a confirmation URL", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaSettingsLink({
        tfaRequestsDto: { type: TfaRequestsDtoType.App },
      });

    expect(status).toBe(200);
    expect(typeof data.response).toBe("string");
  });

  // Docs: 405 "SMS settings are not available" when no SMS provider is
  // configured. Live API returns 403 instead.
  test.fail(
    "BUG 82974: PUT /api/2.0/settings/tfaappwithlink - should return 405 when no SMS provider is configured, but API returns 403",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaSettingsLink({
          tfaRequestsDto: { type: TfaRequestsDtoType.Sms },
        });

      expect(status).toBe(405);
    },
  );
});

test.describe("POST /api/2.0/settings/tfaapp/validate - Owner validates a TFA code", () => {
  // Same restriction as tfaAppGenerateSetupCode above: this self-service check
  // is rejected over a Bearer token even right after a successful link, so the
  // valid/invalid-code distinction can't be exercised through this harness.
  test("POST /api/2.0/settings/tfaapp/validate - Validating a code via a Bearer token is rejected even right after linking", async ({
    apiSdk,
  }) => {
    await linkTfaApp(apiSdk, "owner");

    const { status } = await apiSdk
      .forRole("owner")
      .tfaSettings.tfaValidateAuthCode({
        tfaValidateRequestsDto: { code: "000000" },
      });

    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/tfaapp/confirm - Owner gets TFA confirmation data", () => {
  test("GET /api/2.0/settings/tfaapp/confirm - Owner gets confirmation data once the TFA app is linked", async ({
    apiSdk,
  }) => {
    await linkTfaApp(apiSdk, "owner");

    const { status } = await apiSdk
      .forRole("owner")
      .tfaSettings.getTfaConfirmData();

    expect(status).toBe(200);
  });
});

test.describe("GET+PUT /api/2.0/settings/tfaappcodes|tfaappnewcodes - Owner manages TFA backup codes", () => {
  test("GET /api/2.0/settings/tfaappcodes - Owner gets backup codes once the TFA app is linked", async ({
    apiSdk,
  }) => {
    await linkTfaApp(apiSdk, "owner");

    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.getTfaAppCodes();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  // Docs: 405 "TFA application settings are not available" when TFA App is
  // disabled. Live API returns 403 instead.
  test.fail(
    "BUG 82976: GET /api/2.0/settings/tfaappcodes - should return 405 while TFA App is disabled, but API returns 403",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.getTfaAppCodes();

      expect(status).toBe(405);
    },
  );

  // Same doc/behavior mismatch as above.
  test.fail(
    "BUG 82978: PUT /api/2.0/settings/tfaappnewcodes - should return 405 while TFA App is disabled, but API returns 403",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.updateTfaAppCodes();

      expect(status).toBe(405);
    },
  );

  test("PUT /api/2.0/settings/tfaappnewcodes - Owner regenerates backup codes", async ({
    apiSdk,
  }) => {
    await linkTfaApp(apiSdk, "owner");
    const { data: before } = await apiSdk
      .forRole("owner")
      .tfaSettings.getTfaAppCodes();

    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.updateTfaAppCodes();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response!.map((c) => c.code)).not.toEqual(
      before.response!.map((c) => c.code),
    );
  });
});

test.describe("PUT /api/2.0/settings/tfaappnewapp - Owner unlinks another user's TFA app", () => {
  // Docs: 405 "TFA application settings are not available" when TFA App is
  // disabled. Live API returns 403 instead.
  test.fail(
    "BUG 82983: PUT /api/2.0/settings/tfaappnewapp - should return 405 while TFA App is disabled, but API returns 403",
    async ({ apiSdk }) => {
      const created = await apiSdk.addMember("owner", "User");
      const userId = created.data.response!.id!;

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.unlinkTfaApp({ tfaRequestsDto: { id: userId } });

      expect(status).toBe(405);
    },
  );

  test("PUT /api/2.0/settings/tfaappnewapp - a malformed id is rejected with a validation error", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.unlinkTfaApp({ tfaRequestsDto: { id: "not-a-guid" } });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.["$.id"]).toBeTruthy();
  });

  test("PUT /api/2.0/settings/tfaappnewapp - an empty id is rejected with a validation error", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .tfaSettings.unlinkTfaApp({ tfaRequestsDto: { id: "" } });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.["$.id"]).toBeTruthy();
  });

  test("PUT /api/2.0/settings/tfaappnewapp - Owner unlinks a TFA app previously linked by another user", async ({
    apiSdk,
  }) => {
    await linkTfaApp(apiSdk, "owner");

    const created = await apiSdk.addMember("owner", "User");
    const userId = created.data.response!.id!;
    await linkTfaApp(apiSdk, "user", {
      userName: created.userData.email,
      password: created.userData.password,
    });

    const { status } = await apiSdk
      .forRole("owner")
      .tfaSettings.unlinkTfaApp({ tfaRequestsDto: { id: userId } });

    expect(status).toBe(200);

    // Unlinking invalidates that user's session, same as enabling TFA does.
    const { status: userStatus } = await apiSdk
      .forRole("user")
      .tfaSettings.getTfaSettings();
    expect(userStatus).toBe(401);
  });

  test("PUT /api/2.0/settings/tfaappnewapp - Owner cannot unlink their own TFA app this way", async ({
    apiSdk,
  }) => {
    await linkTfaApp(apiSdk, "owner");

    const { status } = await apiSdk
      .forRole("owner")
      .tfaSettings.unlinkTfaApp({ tfaRequestsDto: {} });

    expect(status).toBe(403);
  });
});
