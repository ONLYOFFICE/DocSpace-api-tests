import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/greetingsettings - Get greeting settings", () => {
  test("GET /api/2.0/settings/greetingsettings - Owner gets greeting settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } =
      await ownerApi.greetingSettings.getGreetingSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof (data.response as unknown as string)).toBe("string");
    expect(data.response as unknown as string).toBeTruthy();
  });

  test("GET /api/2.0/settings/greetingsettings - DocSpaceAdmin gets greeting settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.greetingSettings.getGreetingSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof (data.response as unknown as string)).toBe("string");
    expect(data.response as unknown as string).toBeTruthy();
  });
});

test.describe("GET /api/2.0/settings/greetingsettings/isdefault - Check if greeting settings are default", () => {
  test("GET /api/2.0/settings/greetingsettings/isdefault - Owner checks if greeting settings are default", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } =
      await ownerApi.greetingSettings.getIsDefaultGreetingSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("GET /api/2.0/settings/greetingsettings/isdefault - DocSpaceAdmin checks if greeting settings are default", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.greetingSettings.getIsDefaultGreetingSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });
});

test.describe("POST /api/2.0/settings/greetingsettings - Save greeting settings", () => {
  test("POST /api/2.0/settings/greetingsettings - Owner saves greeting settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const customTitle = "Custom Portal Greeting";

    await test.step("POST greetingsettings - save custom greeting title", async () => {
      const { data, status } =
        await ownerApi.greetingSettings.saveGreetingSettings({
          greetingSettingsRequestsDto: { title: customTitle },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    await test.step("GET greetingsettings - verify custom title was saved", async () => {
      const { data, status } =
        await ownerApi.greetingSettings.getGreetingSettings();

      expect(status).toBe(200);
      expect(data.response as unknown as string).toBe(customTitle);
    });

    await test.step("GET greetingsettings/isdefault - verify settings are no longer default", async () => {
      const { data } =
        await ownerApi.greetingSettings.getIsDefaultGreetingSettings();

      expect(data.response).toBe(false);
    });

    await test.step("POST greetingsettings/restore - cleanup: restore default settings", async () => {
      const { status } =
        await ownerApi.greetingSettings.restoreGreetingSettings();

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/settings/greetingsettings - DocSpaceAdmin saves greeting settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const customTitle = "DocSpaceAdmin Portal Greeting";

    await test.step("POST greetingsettings - save custom greeting title", async () => {
      const { data, status } =
        await adminApi.greetingSettings.saveGreetingSettings({
          greetingSettingsRequestsDto: { title: customTitle },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    await test.step("GET greetingsettings - verify custom title was saved", async () => {
      const { data, status } =
        await adminApi.greetingSettings.getGreetingSettings();

      expect(status).toBe(200);
      expect(data.response as unknown as string).toBe(customTitle);
    });

    await test.step("POST greetingsettings/restore - cleanup: restore default settings", async () => {
      const { status } =
        await ownerApi.greetingSettings.restoreGreetingSettings();

      expect(status).toBe(200);
    });
  });
});

test.describe("POST /api/2.0/settings/greetingsettings/restore - Restore greeting settings", () => {
  test("POST /api/2.0/settings/greetingsettings/restore - Owner restores greeting settings to default", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST greetingsettings - save custom greeting title", async () => {
      const { status } = await ownerApi.greetingSettings.saveGreetingSettings({
        greetingSettingsRequestsDto: { title: "Temporary Title" },
      });

      expect(status).toBe(200);
    });

    await test.step("GET greetingsettings/isdefault - verify settings are not default", async () => {
      const { data } =
        await ownerApi.greetingSettings.getIsDefaultGreetingSettings();

      expect(data.response).toBe(false);
    });

    await test.step("POST greetingsettings/restore - restore default settings", async () => {
      const { data, status } =
        await ownerApi.greetingSettings.restoreGreetingSettings();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    await test.step("GET greetingsettings/isdefault - verify settings are now default", async () => {
      const { data, status } =
        await ownerApi.greetingSettings.getIsDefaultGreetingSettings();

      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });
  });

  test("POST /api/2.0/settings/greetingsettings/restore - DocSpaceAdmin restores greeting settings to default", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST greetingsettings - save custom greeting title", async () => {
      const { status } = await adminApi.greetingSettings.saveGreetingSettings({
        greetingSettingsRequestsDto: { title: "Temporary Admin Title" },
      });

      expect(status).toBe(200);
    });

    await test.step("POST greetingsettings/restore - restore default settings", async () => {
      const { data, status } =
        await adminApi.greetingSettings.restoreGreetingSettings();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    await test.step("GET greetingsettings/isdefault - verify settings are now default", async () => {
      const { data, status } =
        await ownerApi.greetingSettings.getIsDefaultGreetingSettings();

      expect(status).toBe(200);
      expect(data.response).toBe(true);
    });
  });
});
