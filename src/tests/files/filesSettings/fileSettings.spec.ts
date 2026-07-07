import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { DateToAutoCleanUp } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

test.describe("PUT /api/2.0/files/thirdparty - Change third-party settings access", () => {
  test("PUT /api/2.0/files/thirdparty - Owner enables third-party access", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/thirdparty - Owner disables third-party access", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/thirdparty - Owner toggles third-party access on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable third-party access", async () => {
      const { data, status } =
        await ownerApi.filesSettings.changeAccessToThirdparty({
          settingsRequestDto: { set: true },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable third-party access", async () => {
      const { data, status } =
        await ownerApi.filesSettings.changeAccessToThirdparty({
          settingsRequestDto: { set: false },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/thirdparty - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAccessToThirdparty({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/thirdparty - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAccessToThirdparty({
      settingsRequestDto: { set: true },
    });

    const { data, status } =
      await ownerApi.filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/thirdparty - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAccessToThirdparty({
      settingsRequestDto: { set: false },
    });

    const { data, status } =
      await ownerApi.filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/thirdparty - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAccessToThirdparty({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.enableThirdParty).toBe(true);
  });

  test("PUT /api/2.0/files/thirdparty - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAccessToThirdparty({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.enableThirdParty).toBe(false);
  });

  test("PUT /api/2.0/files/thirdparty - Connecting third-party storage fails when access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAccessToThirdparty({
      settingsRequestDto: { set: false },
    });

    const { status } = await ownerApi.thirdPartyIntegration.saveThirdParty({
      thirdPartyRequestDto: {
        url: config.NEXTCLOUD_URL,
        login: config.NEXTCLOUD_LOGIN,
        password: config.NEXTCLOUD_PASSWORD,
        customerTitle: "Autotest TP Disabled",
        providerKey: "Nextcloud",
      },
    });

    expect(status).toBe(403);
  });
});

test.describe("PUT /api/2.0/files/settings/autocleanup - Update trash bin auto-clearing setting", () => {
  test("PUT /api/2.0/files/settings/autocleanup - Owner enables auto-cleanup with OneWeek gap", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: {
          set: true,
          gap: DateToAutoCleanUp.OneWeek,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.OneWeek);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner enables auto-cleanup with TwoWeeks gap", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: {
          set: true,
          gap: DateToAutoCleanUp.TwoWeeks,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.TwoWeeks);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner enables auto-cleanup with OneMonth gap", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: {
          set: true,
          gap: DateToAutoCleanUp.OneMonth,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.OneMonth);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner enables auto-cleanup with ThirtyDays gap", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: {
          set: true,
          gap: DateToAutoCleanUp.ThirtyDays,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.ThirtyDays);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner enables auto-cleanup with TwoMonths gap", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: {
          set: true,
          gap: DateToAutoCleanUp.TwoMonths,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.TwoMonths);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner enables auto-cleanup with ThreeMonths gap", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: {
          set: true,
          gap: DateToAutoCleanUp.ThreeMonths,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.ThreeMonths);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner disables auto-cleanup", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: {
        set: true,
        gap: DateToAutoCleanUp.OneWeek,
      },
    });

    const { data, status } =
      await ownerApi.filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(false);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner toggles auto-cleanup on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable auto-cleanup", async () => {
      const { data, status } =
        await ownerApi.filesSettings.changeAutomaticallyCleanUp({
          autoCleanupRequestDto: {
            set: true,
            gap: DateToAutoCleanUp.OneMonth,
          },
        });
      expect(status).toBe(200);
      expect(data.response?.isAutoCleanUp).toBe(true);
      expect(data.response?.gap).toBe(DateToAutoCleanUp.OneMonth);
    });

    await test.step("Disable auto-cleanup", async () => {
      const { data, status } =
        await ownerApi.filesSettings.changeAutomaticallyCleanUp({
          autoCleanupRequestDto: { set: false },
        });
      expect(status).toBe(200);
      expect(data.response?.isAutoCleanUp).toBe(false);
    });
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner changes gap while auto-cleanup is enabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: {
        set: true,
        gap: DateToAutoCleanUp.OneWeek,
      },
    });

    const { data, status } =
      await ownerApi.filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: {
          set: true,
          gap: DateToAutoCleanUp.ThreeMonths,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.ThreeMonths);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Enabling twice with same gap is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: {
        set: true,
        gap: DateToAutoCleanUp.TwoWeeks,
      },
    });

    const { data, status } =
      await ownerApi.filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: {
          set: true,
          gap: DateToAutoCleanUp.TwoWeeks,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.TwoWeeks);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner enables auto-cleanup without specifying gap", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner sends only gap without set", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: { gap: DateToAutoCleanUp.OneMonth },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.OneMonth);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeAutomaticallyCleanUp({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.isAutoCleanUp).toBe("boolean");
  });

  test("PUT /api/2.0/files/settings/autocleanup - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: {
        set: true,
        gap: DateToAutoCleanUp.TwoMonths,
      },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.automaticallyCleanUp?.isAutoCleanUp).toBe(true);
    expect(data.response?.automaticallyCleanUp?.gap).toBe(
      DateToAutoCleanUp.TwoMonths,
    );
  });

  test("PUT /api/2.0/files/settings/autocleanup - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.automaticallyCleanUp?.isAutoCleanUp).toBe(false);
  });
});
