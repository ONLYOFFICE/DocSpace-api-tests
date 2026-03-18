import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/security/loginsettings - Get login settings", () => {
  test("GET /api/2.0/settings/security/loginsettings - Owner gets login settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.loginSettings.getLoginSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.attemptCount).toBe(5);
    expect(data.response!.blockTime).toBe(60);
    expect(data.response!.checkPeriod).toBe(60);
    expect(data.response!.isDefault).toBe(true);
  });

  test("GET /api/2.0/settings/security/loginsettings - DocSpaceAdmin gets login settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.loginSettings.getLoginSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.attemptCount).toBe(5);
    expect(data.response!.blockTime).toBe(60);
    expect(data.response!.checkPeriod).toBe(60);
    expect(data.response!.isDefault).toBe(true);
  });
});

test.describe("PUT /api/2.0/settings/security/loginsettings - Update login settings", () => {
  test("PUT /api/2.0/settings/security/loginsettings - Owner updates login settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const customSettings = { attemptCount: 3, blockTime: 15, checkPeriod: 60 };

    await test.step("PUT loginsettings - update with custom values", async () => {
      const { data, status } =
        await ownerApi.loginSettings.updateLoginSettings(customSettings);

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.attemptCount).toBe(customSettings.attemptCount);
      expect(data.response!.blockTime).toBe(customSettings.blockTime);
      expect(data.response!.checkPeriod).toBe(customSettings.checkPeriod);
      expect(data.response!.isDefault).toBe(false);
    });

    await test.step("GET loginsettings - verify custom values were saved", async () => {
      const { data, status } = await ownerApi.loginSettings.getLoginSettings();

      expect(status).toBe(200);
      expect(data.response!.attemptCount).toBe(customSettings.attemptCount);
      expect(data.response!.blockTime).toBe(customSettings.blockTime);
      expect(data.response!.checkPeriod).toBe(customSettings.checkPeriod);
      expect(data.response!.isDefault).toBe(false);
    });

    await test.step("DELETE loginsettings - cleanup: restore default settings", async () => {
      const { status } = await ownerApi.loginSettings.setDefaultLoginSettings();

      expect(status).toBe(200);
    });
  });

  test("PUT /api/2.0/settings/security/loginsettings - DocSpaceAdmin updates login settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const customSettings = { attemptCount: 7, blockTime: 20, checkPeriod: 120 };

    await test.step("PUT loginsettings - update with custom values", async () => {
      const { data, status } =
        await adminApi.loginSettings.updateLoginSettings(customSettings);

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.attemptCount).toBe(customSettings.attemptCount);
      expect(data.response!.blockTime).toBe(customSettings.blockTime);
      expect(data.response!.checkPeriod).toBe(customSettings.checkPeriod);
      expect(data.response!.isDefault).toBe(false);
    });

    await test.step("GET loginsettings - verify custom values were saved", async () => {
      const { data, status } = await adminApi.loginSettings.getLoginSettings();

      expect(status).toBe(200);
      expect(data.response!.attemptCount).toBe(customSettings.attemptCount);
      expect(data.response!.blockTime).toBe(customSettings.blockTime);
      expect(data.response!.checkPeriod).toBe(customSettings.checkPeriod);
    });

    await test.step("DELETE loginsettings - cleanup: restore default settings", async () => {
      const { status } = await ownerApi.loginSettings.setDefaultLoginSettings();

      expect(status).toBe(200);
    });
  });
});

test.describe("DELETE /api/2.0/settings/security/loginsettings - Restore default login settings", () => {
  test("DELETE /api/2.0/settings/security/loginsettings - Owner restores default login settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("PUT loginsettings - change settings from default", async () => {
      const { status } = await ownerApi.loginSettings.updateLoginSettings({
        attemptCount: 3,
        blockTime: 5,
        checkPeriod: 30,
      });

      expect(status).toBe(200);
    });

    await test.step("GET loginsettings - verify settings are not default", async () => {
      const { data } = await ownerApi.loginSettings.getLoginSettings();

      expect(data.response!.isDefault).toBe(false);
    });

    await test.step("DELETE loginsettings - restore default settings", async () => {
      const { data, status } =
        await ownerApi.loginSettings.setDefaultLoginSettings();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.attemptCount).toBe(5);
      expect(data.response!.blockTime).toBe(60);
      expect(data.response!.checkPeriod).toBe(60);
      expect(data.response!.isDefault).toBe(true);
    });

    await test.step("GET loginsettings - verify settings are now default", async () => {
      const { data, status } = await ownerApi.loginSettings.getLoginSettings();

      expect(status).toBe(200);
      expect(data.response!.attemptCount).toBe(5);
      expect(data.response!.blockTime).toBe(60);
      expect(data.response!.checkPeriod).toBe(60);
      expect(data.response!.isDefault).toBe(true);
    });
  });

  test("DELETE /api/2.0/settings/security/loginsettings - DocSpaceAdmin restores default login settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("PUT loginsettings - change settings from default", async () => {
      const { status } = await adminApi.loginSettings.updateLoginSettings({
        attemptCount: 4,
        blockTime: 8,
        checkPeriod: 45,
      });

      expect(status).toBe(200);
    });

    await test.step("DELETE loginsettings - restore default settings", async () => {
      const { data, status } =
        await adminApi.loginSettings.setDefaultLoginSettings();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.attemptCount).toBe(5);
      expect(data.response!.blockTime).toBe(60);
      expect(data.response!.checkPeriod).toBe(60);
      expect(data.response!.isDefault).toBe(true);
    });

    await test.step("GET loginsettings - verify settings are now default", async () => {
      const { data, status } = await ownerApi.loginSettings.getLoginSettings();

      expect(status).toBe(200);
      expect(data.response!.attemptCount).toBe(5);
      expect(data.response!.blockTime).toBe(60);
      expect(data.response!.checkPeriod).toBe(60);
      expect(data.response!.isDefault).toBe(true);
    });
  });
});
