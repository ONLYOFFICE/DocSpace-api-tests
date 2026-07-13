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

test.describe("PUT /api/2.0/files/forcesave - Change the forcesaving ability", () => {
  test("PUT /api/2.0/files/forcesave - Owner calls forcesave and receives boolean response", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.forcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/forcesave - State is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: toggleData } = await ownerApi.filesSettings.forcesave();
    const newState = toggleData.response;

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.forcesave).toBe(newState);
  });
});

test.describe("PUT /api/2.0/files/displayfileextension - Display file extension", () => {
  test("PUT /api/2.0/files/displayfileextension - Owner enables file extension display", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.displayFileExtension({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayfileextension - Owner disables file extension display", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.displayFileExtension({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/displayfileextension - Owner toggles file extension display on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable file extension display", async () => {
      const { data, status } =
        await ownerApi.filesSettings.displayFileExtension({
          settingsRequestDto: { set: true },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable file extension display", async () => {
      const { data, status } =
        await ownerApi.filesSettings.displayFileExtension({
          settingsRequestDto: { set: false },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/displayfileextension - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayfileextension - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/displayfileextension - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.displayFileExtension({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/displayfileextension - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.displayFileExtension).toBe(true);
  });

  test("PUT /api/2.0/files/displayfileextension - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.displayFileExtension).toBe(false);
  });

  test("PUT /api/2.0/files/displayfileextension - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: false },
    });
    await userApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.displayFileExtension).toBe(false);
  });
});

test.describe("PUT /api/2.0/files/displayrecent - Display the Recent folder", () => {
  test("PUT /api/2.0/files/displayrecent - Owner enables Recent folder display", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.displayRecent({ displayRequestDto: { set: true } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayrecent - Owner disables Recent folder display", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.displayRecent({ displayRequestDto: { set: false } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/displayrecent - Owner toggles Recent folder display on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable Recent folder display", async () => {
      const { data, status } = await ownerApi.filesSettings.displayRecent({
        displayRequestDto: { set: true },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable Recent folder display", async () => {
      const { data, status } = await ownerApi.filesSettings.displayRecent({
        displayRequestDto: { set: false },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/displayrecent - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayRecent({
      displayRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.displayRecent({
      displayRequestDto: { set: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayrecent - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayRecent({
      displayRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.displayRecent({
      displayRequestDto: { set: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/displayrecent - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.displayRecent({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/displayrecent - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayRecent({
      displayRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.recentSection).toBe(true);
  });

  test("PUT /api/2.0/files/displayrecent - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayRecent({
      displayRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.recentSection).toBe(false);
  });

  test("PUT /api/2.0/files/displayrecent - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.displayRecent({
      displayRequestDto: { set: false },
    });
    await userApi.filesSettings.displayRecent({
      displayRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.recentSection).toBe(false);
  });

  test("PUT /api/2.0/files/displayrecent - getRecentFolder is accessible when Recent folder is enabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.displayRecent({
      displayRequestDto: { set: true },
    });

    const { status } = await ownerApi.folders.getRecentFolder();

    expect(status).toBe(200);
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

test.describe("GET /api/2.0/files/settings/autocleanup - Get trash bin auto-clearing setting", () => {
  test("GET /api/2.0/files/settings/autocleanup - Owner reads current auto-cleanup setting", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.isAutoCleanUp).toBe("boolean");
  });

  test("GET /api/2.0/files/settings/autocleanup - Reflects enabled state after changeAutomaticallyCleanUp", async ({
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
      await ownerApi.filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.TwoWeeks);
  });

  test("GET /api/2.0/files/settings/autocleanup - Reflects disabled state after changeAutomaticallyCleanUp", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: { set: false },
    });

    const { data, status } =
      await ownerApi.filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(false);
  });

  test("GET /api/2.0/files/settings/autocleanup - Reflects updated gap after changeAutomaticallyCleanUp", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: {
        set: true,
        gap: DateToAutoCleanUp.ThreeMonths,
      },
    });

    const { data, status } =
      await ownerApi.filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.ThreeMonths);
  });

  test("GET /api/2.0/files/settings/autocleanup - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: {
        set: true,
        gap: DateToAutoCleanUp.OneWeek,
      },
    });
    await userApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: {
        set: true,
        gap: DateToAutoCleanUp.ThreeMonths,
      },
    });

    const { data, status } =
      await ownerApi.filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
    expect(data.response?.gap).toBe(DateToAutoCleanUp.OneWeek);
  });
});

test.describe("PUT /api/2.0/files/storeoriginal - Change the ability to upload original formats", () => {
  test("PUT /api/2.0/files/storeoriginal - Owner enables storing original files", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.storeOriginal({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/storeoriginal - Owner disables storing original files", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.storeOriginal({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/storeoriginal - Owner toggles store original setting on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable storing original files", async () => {
      const { data, status } = await ownerApi.filesSettings.storeOriginal({
        settingsRequestDto: { set: true },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable storing original files", async () => {
      const { data, status } = await ownerApi.filesSettings.storeOriginal({
        settingsRequestDto: { set: false },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/storeoriginal - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/storeoriginal - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/storeoriginal - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.storeOriginal({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/storeoriginal - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.storeOriginalFiles).toBe(true);
  });

  test("PUT /api/2.0/files/storeoriginal - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.storeOriginalFiles).toBe(false);
  });

  test("PUT /api/2.0/files/storeoriginal - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: false },
    });
    await userApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.storeOriginalFiles).toBe(false);
  });
});

test.describe("PUT /api/2.0/files/storeforcesave - Change the ability to store forcesaved file versions", () => {
  test("PUT /api/2.0/files/storeforcesave - Owner calls storeForcesave and receives boolean response", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.storeForcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/storeforcesave - State is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: toggleData } = await ownerApi.filesSettings.storeForcesave();
    const newState = toggleData.response;

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.storeForcesave).toBe(newState);
  });
});

test.describe("PUT /api/2.0/files/settings/openeditorinsametab - Open document in the same browser tab", () => {
  test("PUT /api/2.0/files/settings/openeditorinsametab - Owner enables opening editor in same tab", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Owner disables opening editor in same tab", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Owner toggles open-in-same-tab setting on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable opening editor in same tab", async () => {
      const { data, status } =
        await ownerApi.filesSettings.setOpenEditorInSameTab({
          settingsRequestDto: { set: true },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable opening editor in same tab", async () => {
      const { data, status } =
        await ownerApi.filesSettings.setOpenEditorInSameTab({
          settingsRequestDto: { set: false },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.setOpenEditorInSameTab({
      settingsRequestDto: { set: true },
    });

    const { data, status } =
      await ownerApi.filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.setOpenEditorInSameTab({
      settingsRequestDto: { set: false },
    });

    const { data, status } =
      await ownerApi.filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.setOpenEditorInSameTab({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.setOpenEditorInSameTab({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.openEditorInSameTab).toBe(true);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.setOpenEditorInSameTab({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.openEditorInSameTab).toBe(false);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.setOpenEditorInSameTab({
      settingsRequestDto: { set: false },
    });
    await userApi.filesSettings.setOpenEditorInSameTab({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.openEditorInSameTab).toBe(false);
  });
});

test.describe("PUT /api/2.0/files/keepnewfilename - Ask a new file name on creation", () => {
  test("PUT /api/2.0/files/keepnewfilename - Owner enables keeping new file name", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.keepNewFileName({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/keepnewfilename - Owner disables keeping new file name", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.keepNewFileName({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/keepnewfilename - Owner toggles keep-new-file-name setting on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable keeping new file name", async () => {
      const { data, status } = await ownerApi.filesSettings.keepNewFileName({
        settingsRequestDto: { set: true },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable keeping new file name", async () => {
      const { data, status } = await ownerApi.filesSettings.keepNewFileName({
        settingsRequestDto: { set: false },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/keepnewfilename - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/keepnewfilename - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/keepnewfilename - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.keepNewFileName({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/keepnewfilename - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.keepNewFileName).toBe(true);
  });

  test("PUT /api/2.0/files/keepnewfilename - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.keepNewFileName).toBe(false);
  });

  test("PUT /api/2.0/files/keepnewfilename - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: false },
    });
    await userApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.keepNewFileName).toBe(false);
  });
});

test.describe("GET /api/2.0/files/docservice - Get the document service URL", () => {
  test("GET /api/2.0/files/docservice - Owner returns 200 with document service URL data", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getDocServiceUrl();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.isDefault).toBe("boolean");
    expect(typeof data.response?.docServiceSslVerification).toBe("boolean");
  });

  test("GET /api/2.0/files/docservice - docServiceUrl is a non-null string", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getDocServiceUrl();

    expect(status).toBe(200);
    expect(typeof data.response?.docServiceUrl).toBe("string");
    expect(data.response?.docServiceUrl).not.toBe("");
  });

  test("GET /api/2.0/files/docservice - docServiceUrlApi is a non-null string", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getDocServiceUrl();

    expect(status).toBe(200);
    expect(typeof data.response?.docServiceUrlApi).toBe("string");
    expect(data.response?.docServiceUrlApi).not.toBe("");
  });

  test("GET /api/2.0/files/docservice - With version=true returns non-null version string", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getDocServiceUrl({ version: true });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.version).toBe("string");
  });

  test("GET /api/2.0/files/docservice - With version=false returns 200", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getDocServiceUrl({ version: false });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });
});

test.describe("PUT /api/2.0/files/docservice - Check the document service URL", () => {
  test("PUT /api/2.0/files/docservice - Owner checks valid doc service URL and gets 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: current } = await ownerApi.filesSettings.getDocServiceUrl();
    const currentUrl = current.response?.docServiceUrl ?? "";

    const { data, status } = await ownerApi.filesSettings.checkDocServiceUrl({
      checkDocServiceUrlRequestDto: { docServiceUrl: currentUrl },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("PUT /api/2.0/files/docservice - Response contains docServiceUrlApi as non-empty string", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: current } = await ownerApi.filesSettings.getDocServiceUrl();
    const currentUrl = current.response?.docServiceUrl ?? "";

    const { data, status } = await ownerApi.filesSettings.checkDocServiceUrl({
      checkDocServiceUrlRequestDto: { docServiceUrl: currentUrl },
    });

    expect(status).toBe(200);
    expect(typeof data.response?.docServiceUrlApi).toBe("string");
    expect(data.response?.docServiceUrlApi).not.toBe("");
  });

  test("PUT /api/2.0/files/docservice - Response contains docServiceUrl as string", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: current } = await ownerApi.filesSettings.getDocServiceUrl();
    const currentUrl = current.response?.docServiceUrl ?? "";

    const { data, status } = await ownerApi.filesSettings.checkDocServiceUrl({
      checkDocServiceUrlRequestDto: { docServiceUrl: currentUrl },
    });

    expect(status).toBe(200);
    expect(typeof data.response?.docServiceUrl).toBe("string");
  });

  test("PUT /api/2.0/files/docservice - Response contains docServiceSslVerification as boolean", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: current } = await ownerApi.filesSettings.getDocServiceUrl();
    const currentUrl = current.response?.docServiceUrl ?? "";

    const { data, status } = await ownerApi.filesSettings.checkDocServiceUrl({
      checkDocServiceUrlRequestDto: { docServiceUrl: currentUrl },
    });

    expect(status).toBe(200);
    expect(typeof data.response?.docServiceSslVerification).toBe("boolean");
  });

  test("PUT /api/2.0/files/docservice - Checking the default URL sets isDefault to true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: current } = await ownerApi.filesSettings.getDocServiceUrl();
    const currentUrl = current.response?.docServiceUrl ?? "";

    const { data, status } = await ownerApi.filesSettings.checkDocServiceUrl({
      checkDocServiceUrlRequestDto: { docServiceUrl: currentUrl },
    });

    expect(status).toBe(200);
    expect(data.response?.isDefault).toBe(true);
  });

  test("PUT /api/2.0/files/docservice - Checked URL is saved and reflected in getDocServiceUrl", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: current } = await ownerApi.filesSettings.getDocServiceUrl();
    const currentUrl = current.response?.docServiceUrl ?? "";

    await ownerApi.filesSettings.checkDocServiceUrl({
      checkDocServiceUrlRequestDto: { docServiceUrl: currentUrl },
    });

    const { data, status } = await ownerApi.filesSettings.getDocServiceUrl();

    expect(status).toBe(200);
    expect(data.response?.docServiceUrl).toBe(currentUrl);
  });

  test("PUT /api/2.0/files/docservice - Check with docServiceUrl: null returns 200", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.checkDocServiceUrl({
        checkDocServiceUrlRequestDto: { docServiceUrl: null },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("PUT /api/2.0/files/docservice - Passing docServiceSslVerification: false is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: current } = await ownerApi.filesSettings.getDocServiceUrl();
    const currentUrl = current.response?.docServiceUrl ?? "";

    const { data, status } = await ownerApi.filesSettings.checkDocServiceUrl({
      checkDocServiceUrlRequestDto: {
        docServiceUrl: currentUrl,
        docServiceSslVerification: false,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.docServiceSslVerification).toBe(false);
  });
});

test.describe("GET /api/2.0/files/module - Get the Documents module information", () => {
  test("GET /api/2.0/files/module - Owner returns 200 with module data", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesModule();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/files/module - id is a non-empty string", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesModule();

    expect(status).toBe(200);
    expect(typeof data.response?.id).toBe("string");
    expect(data.response?.id).not.toBe("");
  });

  test("GET /api/2.0/files/module - title is a non-empty string", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesModule();

    expect(status).toBe(200);
    expect(typeof data.response?.title).toBe("string");
    expect(data.response?.title).not.toBe("");
  });

  test("GET /api/2.0/files/module - link is a non-empty string", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesModule();

    expect(status).toBe(200);
    expect(typeof data.response?.link).toBe("string");
    expect(data.response?.link).not.toBe("");
  });

  test("GET /api/2.0/files/module - isPrimary is a boolean", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesModule();

    expect(status).toBe(200);
    expect(typeof data.response?.isPrimary).toBe("boolean");
  });
});

test.describe("GET /api/2.0/files/settings - Get all file settings", () => {
  test("GET /api/2.0/files/settings - Owner returns 200 with FilesSettingsDto", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("GET /api/2.0/files/settings - extsWebEdited is a non-empty array", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(Array.isArray(data.response?.extsWebEdited)).toBe(true);
    expect(data.response?.extsWebEdited?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/settings - extsWebEdited contains .docx", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.extsWebEdited).toContain(".docx");
  });

  test("GET /api/2.0/files/settings - extsDocument contains .docx", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.extsDocument).toContain(".docx");
  });

  test("GET /api/2.0/files/settings - extsSpreadsheet contains .xlsx", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.extsSpreadsheet).toContain(".xlsx");
  });

  test("GET /api/2.0/files/settings - extsPresentation contains .pptx", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.extsPresentation).toContain(".pptx");
  });

  test("GET /api/2.0/files/settings - boolean settings fields are booleans", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.forcesave).toBe("boolean");
    expect(typeof data.response?.storeForcesave).toBe("boolean");
    expect(typeof data.response?.storeOriginalFiles).toBe("boolean");
    expect(typeof data.response?.keepNewFileName).toBe("boolean");
    expect(typeof data.response?.displayFileExtension).toBe("boolean");
    expect(typeof data.response?.openEditorInSameTab).toBe("boolean");
  });

  test("GET /api/2.0/files/settings - maxUploadThreadCount and chunkUploadSize are positive numbers", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.maxUploadThreadCount).toBeGreaterThan(0);
    expect(data.response?.chunkUploadSize).toBeGreaterThan(0);
  });
});

test.describe("PUT /api/2.0/files/hideconfirmcanceloperation - Hide confirmation dialog when canceling an operation", () => {
  test("PUT /api/2.0/files/hideconfirmcanceloperation - Owner hides the cancel operation confirmation dialog", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmCancelOperation({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmcanceloperation - Owner shows the cancel operation confirmation dialog", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmCancelOperation({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/hideconfirmcanceloperation - Owner toggles the setting on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Hide the dialog", async () => {
      const { data, status } =
        await ownerApi.filesSettings.hideConfirmCancelOperation({
          settingsRequestDto: { set: true },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Show the dialog", async () => {
      const { data, status } =
        await ownerApi.filesSettings.hideConfirmCancelOperation({
          settingsRequestDto: { set: false },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/hideconfirmcanceloperation - Hiding when already hidden is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmCancelOperation({
      settingsRequestDto: { set: true },
    });

    const { data, status } =
      await ownerApi.filesSettings.hideConfirmCancelOperation({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmcanceloperation - Showing when already shown is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmCancelOperation({
      settingsRequestDto: { set: false },
    });

    const { data, status } =
      await ownerApi.filesSettings.hideConfirmCancelOperation({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/hideconfirmcanceloperation - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmCancelOperation({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/hideconfirmcanceloperation - Hidden state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmCancelOperation({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmCancelOperation).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmcanceloperation - Shown state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmCancelOperation({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmCancelOperation).toBe(false);
  });

  test("PUT /api/2.0/files/hideconfirmcanceloperation - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.hideConfirmCancelOperation({
      settingsRequestDto: { set: false },
    });
    await userApi.filesSettings.hideConfirmCancelOperation({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmCancelOperation).toBe(false);
  });
});

test.describe("PUT /api/2.0/files/hideconfirmconvert - Hide confirmation dialog when converting", () => {
  test("PUT /api/2.0/files/hideconfirmconvert - Owner calls with save: true and receives boolean response", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmConvert({
        hideConfirmConvertRequestDto: { save: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmconvert - Owner calls with save: false and receives boolean response", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmConvert({
        hideConfirmConvertRequestDto: { save: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmconvert - save: true state is reflected in getFilesSettings hideConfirmConvertSave", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmConvertSave).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmconvert - save: false state is reflected in getFilesSettings hideConfirmConvertOpen", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmConvertOpen).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmconvert - save: true and save: false are independent settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: saveData } = await ownerApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: true },
    });
    const saveState = saveData.response;

    const { data: openData } = await ownerApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: false },
    });
    const openState = openData.response;

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmConvertSave).toBe(saveState);
    expect(data.response?.hideConfirmConvertOpen).toBe(openState);
  });

  test("PUT /api/2.0/files/hideconfirmconvert - Repeated call with save: true is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: true },
    });

    const { data: first } = await ownerApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: true },
    });
    const stateAfterFirst = first.response;

    const { data: second, status } =
      await ownerApi.filesSettings.hideConfirmConvert({
        hideConfirmConvertRequestDto: { save: true },
      });

    expect(status).toBe(200);
    expect(second.response).toBe(stateAfterFirst);
  });

  test("PUT /api/2.0/files/hideconfirmconvert - Repeated call with save: false is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: false },
    });

    const { data: first } = await ownerApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: false },
    });
    const stateAfterFirst = first.response;

    const { data: second, status } =
      await ownerApi.filesSettings.hideConfirmConvert({
        hideConfirmConvertRequestDto: { save: false },
      });

    expect(status).toBe(200);
    expect(second.response).toBe(stateAfterFirst);
  });

  test("PUT /api/2.0/files/hideconfirmconvert - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmConvert({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/hideconfirmconvert - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    const { data: ownerData } = await ownerApi.filesSettings.hideConfirmConvert(
      {
        hideConfirmConvertRequestDto: { save: true },
      },
    );
    const ownerState = ownerData.response;

    await userApi.filesSettings.hideConfirmConvert({
      hideConfirmConvertRequestDto: { save: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmConvertSave).toBe(ownerState);
  });
});

test.describe("PUT /api/2.0/files/hideconfirmroomlifetime - Hide confirmation dialog about room file lifetime", () => {
  test("PUT /api/2.0/files/hideconfirmroomlifetime - Owner hides the room lifetime confirmation dialog", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmRoomLifetime({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmroomlifetime - Owner shows the room lifetime confirmation dialog", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmRoomLifetime({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/hideconfirmroomlifetime - Owner toggles the setting on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Hide the dialog", async () => {
      const { data, status } =
        await ownerApi.filesSettings.hideConfirmRoomLifetime({
          settingsRequestDto: { set: true },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Show the dialog", async () => {
      const { data, status } =
        await ownerApi.filesSettings.hideConfirmRoomLifetime({
          settingsRequestDto: { set: false },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/hideconfirmroomlifetime - Hiding when already hidden is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmRoomLifetime({
      settingsRequestDto: { set: true },
    });

    const { data, status } =
      await ownerApi.filesSettings.hideConfirmRoomLifetime({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmroomlifetime - Showing when already shown is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmRoomLifetime({
      settingsRequestDto: { set: false },
    });

    const { data, status } =
      await ownerApi.filesSettings.hideConfirmRoomLifetime({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/hideconfirmroomlifetime - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.hideConfirmRoomLifetime({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/hideconfirmroomlifetime - Hidden state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmRoomLifetime({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmRoomLifetime).toBe(true);
  });

  test("PUT /api/2.0/files/hideconfirmroomlifetime - Shown state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.hideConfirmRoomLifetime({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmRoomLifetime).toBe(false);
  });

  test("PUT /api/2.0/files/hideconfirmroomlifetime - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.hideConfirmRoomLifetime({
      settingsRequestDto: { set: false },
    });
    await userApi.filesSettings.hideConfirmRoomLifetime({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.hideConfirmRoomLifetime).toBe(false);
  });
});

test.describe("PUT /api/2.0/files/settings/external - Change the external sharing ability", () => {
  test("PUT /api/2.0/files/settings/external - Owner enables external sharing", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.externalShare({
        displayRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/external - Owner disables external sharing", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.externalShare({
        displayRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/settings/external - Owner toggles external sharing on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable external sharing", async () => {
      const { data, status } = await ownerApi.filesSettings.externalShare({
        displayRequestDto: { set: true },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable external sharing", async () => {
      const { data, status } = await ownerApi.filesSettings.externalShare({
        displayRequestDto: { set: false },
      });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/settings/external - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/external - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/settings/external - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.externalShare({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/settings/external - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.externalShare).toBe(true);
  });

  test("PUT /api/2.0/files/settings/external - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.externalShare).toBe(false);
  });

  test("PUT /api/2.0/files/settings/external - Disabling external sharing also disables externalShareSocialMedia", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShareSocialMedia({
      displayRequestDto: { set: true },
    });

    await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.externalShareSocialMedia).toBe(false);
  });

  test("PUT /api/2.0/files/settings/external - Setting change by Owner is visible to DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: true },
    });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.externalShare).toBe(true);
  });
});

test.describe("PUT /api/2.0/files/settings/externalsocialmedia - Change the external sharing ability on social networks", () => {
  test("PUT /api/2.0/files/settings/externalsocialmedia - Owner enables social media sharing", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.externalShareSocialMedia({
        displayRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Owner disables social media sharing", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.externalShareSocialMedia({
        displayRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Owner toggles social media sharing on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable social media sharing", async () => {
      const { data, status } =
        await ownerApi.filesSettings.externalShareSocialMedia({
          displayRequestDto: { set: true },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable social media sharing", async () => {
      const { data, status } =
        await ownerApi.filesSettings.externalShareSocialMedia({
          displayRequestDto: { set: false },
        });
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShareSocialMedia({
      displayRequestDto: { set: true },
    });

    const { data, status } =
      await ownerApi.filesSettings.externalShareSocialMedia({
        displayRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShareSocialMedia({
      displayRequestDto: { set: false },
    });

    const { data, status } =
      await ownerApi.filesSettings.externalShareSocialMedia({
        displayRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.externalShareSocialMedia({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShareSocialMedia({
      displayRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.externalShareSocialMedia).toBe(true);
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShareSocialMedia({
      displayRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.externalShareSocialMedia).toBe(false);
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Setting change by Owner is visible to DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShareSocialMedia({
      displayRequestDto: { set: true },
    });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.externalShareSocialMedia).toBe(true);
  });

  test("PUT /api/2.0/files/settings/externalsocialmedia - Disabling externalShare overrides social media sharing setting", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.externalShareSocialMedia({
      displayRequestDto: { set: true },
    });

    await ownerApi.filesSettings.externalShare({
      displayRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.externalShareSocialMedia).toBe(false);
  });
});

test.describe("PUT /api/2.0/files/changedeleteconfrim - Confirm the file deletion", () => {
  test("PUT /api/2.0/files/changedeleteconfrim - Owner enables delete confirmation dialog", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeDeleteConfirm({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/changedeleteconfrim - Owner disables delete confirmation dialog", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeDeleteConfirm({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/changedeleteconfrim - Owner toggles delete confirmation dialog on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable delete confirmation dialog", async () => {
      const { data, status } = await ownerApi.filesSettings.changeDeleteConfirm(
        {
          settingsRequestDto: { set: true },
        },
      );
      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });

    await test.step("Disable delete confirmation dialog", async () => {
      const { data, status } = await ownerApi.filesSettings.changeDeleteConfirm(
        {
          settingsRequestDto: { set: false },
        },
      );
      expect(status).toBe(200);
      expect(data.response).toBe(false);
    });
  });

  test("PUT /api/2.0/files/changedeleteconfrim - Enabling when already enabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeDeleteConfirm({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.changeDeleteConfirm({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/changedeleteconfrim - Disabling when already disabled is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeDeleteConfirm({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.changeDeleteConfirm({
      settingsRequestDto: { set: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/changedeleteconfrim - Owner sends request without body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.changeDeleteConfirm({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/changedeleteconfrim - Enabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeDeleteConfirm({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.confirmDelete).toBe(true);
  });

  test("PUT /api/2.0/files/changedeleteconfrim - Disabled state is reflected in getFilesSettings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.filesSettings.changeDeleteConfirm({
      settingsRequestDto: { set: false },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.confirmDelete).toBe(false);
  });

  test("PUT /api/2.0/files/changedeleteconfrim - Setting is isolated per user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");
    const ownerApi = apiSdk.forRole("owner");
    const userApi = apiSdk.forRole("user");

    await ownerApi.filesSettings.changeDeleteConfirm({
      settingsRequestDto: { set: false },
    });
    await userApi.filesSettings.changeDeleteConfirm({
      settingsRequestDto: { set: true },
    });

    const { data, status } = await ownerApi.filesSettings.getFilesSettings();

    expect(status).toBe(200);
    expect(data.response?.confirmDelete).toBe(false);
  });
});
