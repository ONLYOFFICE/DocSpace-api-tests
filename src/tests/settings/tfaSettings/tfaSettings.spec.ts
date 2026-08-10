import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { TfaRequestsDtoType } from "@onlyoffice/docspace-api-sdk";
import { enableTfaApp, linkTfaApp, resetTfaAfterTest } from "@/src/helpers/tfa";

// Enabling TFA App makes the fixture's own owner-password re-login (used to
// clean up the portal after each test) return a tfaKey instead of a token, so
// the portal never gets deleted. resetTfaAfterTest disables TFA again before
// teardown, completing the TFA login first if the test left owner's token
// stale (e.g. it enabled TFA but never linked/logged back in).
//
// Note on "not available" cases below (SMS with no provider, actions while
// TFA App is disabled/not linked): the official docs say these return 405,
// but the live API consistently returns 403 instead - reproduced across many
// fresh portals with no exceptions. Marked test.fail, asserting the documented
// 405, until this is confirmed as intended and the docs are updated, or fixed
// and a bug number is filed.
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
  // TODO: add bug number once filed.
  test.fail(
    "BUG TBD: PUT /api/2.0/settings/tfaapp - should return 405 when no SMS provider is configured, but API returns 403",
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
  // disabled. Live API returns 403 instead. TODO: add bug number once filed.
  test.fail(
    "BUG TBD: GET /api/2.0/settings/tfaapp/setup - should return 405 while TFA App is disabled, but API returns 403",
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
  // configured. Live API returns 403 instead. TODO: add bug number once filed.
  test.fail(
    "BUG TBD: PUT /api/2.0/settings/tfaappwithlink - should return 405 when no SMS provider is configured, but API returns 403",
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
  // disabled. Live API returns 403 instead. TODO: add bug number once filed.
  test.fail(
    "BUG TBD: GET /api/2.0/settings/tfaappcodes - should return 405 while TFA App is disabled, but API returns 403",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.getTfaAppCodes();

      expect(status).toBe(405);
    },
  );

  // Same doc/behavior mismatch as above. TODO: add bug number once filed.
  test.fail(
    "BUG TBD: PUT /api/2.0/settings/tfaappnewcodes - should return 405 while TFA App is disabled, but API returns 403",
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
  // disabled. Live API returns 403 instead. TODO: add bug number once filed.
  test.fail(
    "BUG TBD: PUT /api/2.0/settings/tfaappnewapp - should return 405 while TFA App is disabled, but API returns 403",
    async ({ apiSdk }) => {
      const created = await apiSdk.addMember("owner", "User");
      const userId = created.data.response!.id!;

      const { status } = await apiSdk
        .forRole("owner")
        .tfaSettings.unlinkTfaApp({ tfaRequestsDto: { id: userId } });

      expect(status).toBe(405);
    },
  );

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
