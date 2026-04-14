import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { TenantTrustedDomainsType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/settings/messages/enable - Enable admin message settings", () => {
  test("POST /api/2.0/settings/messages/enable - Owner enables admin message settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST messages/enable - enable admin messages (turnOn: true)", async () => {
      const { data, status } =
        await ownerApi.settingsMessages.enableAdminMessageSettings({
          turnOnAdminMessageSettingsRequestDto: { turnOn: true },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.status).toBe(0);
      expect(data.response).toBe("Settings have been successfully updated");
      expect(data.count).toBe(1);
      expect(Array.isArray(data.links)).toBe(true);
      expect(data.links!.length).toBeGreaterThan(0);
    });

    await test.step("POST messages/enable - cleanup: disable admin messages (turnOn: false)", async () => {
      const { status } =
        await ownerApi.settingsMessages.enableAdminMessageSettings({
          turnOnAdminMessageSettingsRequestDto: { turnOn: false },
        });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/settings/messages/enable - Owner disables admin message settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } =
      await ownerApi.settingsMessages.enableAdminMessageSettings({
        turnOnAdminMessageSettingsRequestDto: { turnOn: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.status).toBe(0);
    expect(data.response).toBe("Settings have been successfully updated");
    expect(data.count).toBe(1);
    expect(Array.isArray(data.links)).toBe(true);
    expect(data.links!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/settings/messages/enable - Owner toggles admin message settings on and off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("POST messages/enable - enable (turnOn: true)", async () => {
      const { data, status } =
        await ownerApi.settingsMessages.enableAdminMessageSettings({
          turnOnAdminMessageSettingsRequestDto: { turnOn: true },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.status).toBe(0);
      expect(data.response).toBe("Settings have been successfully updated");
      expect(data.count).toBe(1);
      expect(Array.isArray(data.links)).toBe(true);
      expect(data.links!.length).toBeGreaterThan(0);
    });

    await test.step("POST messages/enable - disable (turnOn: false)", async () => {
      const { data, status } =
        await ownerApi.settingsMessages.enableAdminMessageSettings({
          turnOnAdminMessageSettingsRequestDto: { turnOn: false },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.status).toBe(0);
      expect(data.response).toBe("Settings have been successfully updated");
      expect(data.count).toBe(1);
      expect(Array.isArray(data.links)).toBe(true);
      expect(data.links!.length).toBeGreaterThan(0);
    });
  });

  test("POST /api/2.0/settings/messages/enable - DocSpaceAdmin enables admin message settings", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await test.step("POST messages/enable - DocSpaceAdmin enables admin messages (turnOn: true)", async () => {
      const { data, status } =
        await adminApi.settingsMessages.enableAdminMessageSettings({
          turnOnAdminMessageSettingsRequestDto: { turnOn: true },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.status).toBe(0);
      expect(data.response).toBe("Settings have been successfully updated");
      expect(data.count).toBe(1);
      expect(Array.isArray(data.links)).toBe(true);
      expect(data.links!.length).toBeGreaterThan(0);
    });

    await test.step("POST messages/enable - cleanup: disable admin messages (turnOn: false)", async () => {
      const { status } =
        await ownerApi.settingsMessages.enableAdminMessageSettings({
          turnOnAdminMessageSettingsRequestDto: { turnOn: false },
        });

      expect(status).toBe(200);
    });
  });

  test("POST /api/2.0/settings/messages/enable - DocSpaceAdmin disables admin message settings", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.settingsMessages.enableAdminMessageSettings({
        turnOnAdminMessageSettingsRequestDto: { turnOn: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.status).toBe(0);
    expect(data.response).toBe("Settings have been successfully updated");
    expect(data.count).toBe(1);
    expect(Array.isArray(data.links)).toBe(true);
    expect(data.links!.length).toBeGreaterThan(0);
  });
});

test.describe("POST /api/2.0/settings/sendjoininvite - Send join invite mail", () => {
  test("BUG 79040: POST /api/2.0/settings/sendjoininvite - Owner sends join invite to already registered user gets 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await test.step("Enable trusted mail domains (any domain)", async () => {
      const { status } = await ownerApi.commonSettings.saveMailDomainSettings({
        mailDomainSettingsRequestsDto: {
          type: TenantTrustedDomainsType.All,
          domains: [],
          inviteUsersAsVisitors: true,
        },
      });
      expect(status).toBe(200);
    });

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const existingEmail = userData.response!.email!;

    const { data, status } = await ownerApi.settingsMessages.sendJoinInviteMail(
      {
        adminMessageBaseSettingsRequestsDto: { email: existingEmail },
      },
    );

    expect(status).toBe(400);
    expect((data as any).error.message).toBe(
      "User with this email is already registered",
    );
  });

  test.fail(
    "BUG 80727: POST /api/2.0/settings/sendjoininvite - Owner sends join invite mail",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { email } = apiSdk.faker.generateUser();

      const { data, status } =
        await ownerApi.settingsMessages.sendJoinInviteMail({
          adminMessageBaseSettingsRequestsDto: { email },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(typeof (data.response as unknown as string)).toBe("string");
    },
  );

  test.fail(
    "BUG 80727: POST /api/2.0/settings/sendjoininvite - Owner sends join invite mail with culture specified",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { email } = apiSdk.faker.generateUser();

      const { data, status } =
        await ownerApi.settingsMessages.sendJoinInviteMail({
          adminMessageBaseSettingsRequestsDto: { email, culture: "en-US" },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(typeof (data.response as unknown as string)).toBe("string");
    },
  );

  test.fail(
    "BUG 80727: POST /api/2.0/settings/sendjoininvite - DocSpaceAdmin sends join invite mail",
    async ({ apiSdk }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      const { email } = apiSdk.faker.generateUser();

      const { data, status } =
        await adminApi.settingsMessages.sendJoinInviteMail({
          adminMessageBaseSettingsRequestsDto: { email },
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(typeof (data.response as unknown as string)).toBe("string");
    },
  );
});
