import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("POST /api/2.0/settings/messages/enable - access control", () => {
  test("POST /api/2.0/settings/messages/enable - anonymous cannot enable admin message settings", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } =
      await anonApi.settingsMessages.enableAdminMessageSettings({
        turnOnAdminMessageSettingsRequestDto: { turnOn: true },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/messages/enable - RoomAdmin cannot enable admin message settings", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.settingsMessages.enableAdminMessageSettings({
        turnOnAdminMessageSettingsRequestDto: { turnOn: true },
      });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/messages/enable - User cannot enable admin message settings", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.settingsMessages.enableAdminMessageSettings({
        turnOnAdminMessageSettingsRequestDto: { turnOn: true },
      });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/settings/messages/enable - Guest cannot enable admin message settings", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.settingsMessages.enableAdminMessageSettings({
        turnOnAdminMessageSettingsRequestDto: { turnOn: true },
      });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/settings/sendjoininvite - access control", () => {
  test.fail(
    "BUG XXXXX: POST /api/2.0/settings/sendjoininvite - anonymous cannot send join invite mail",
    async ({ apiSdk }) => {
      const anonApi = apiSdk.forAnonymous();
      const { email } = apiSdk.faker.generateUser();

      const { status } = await anonApi.settingsMessages.sendJoinInviteMail({
        adminMessageBaseSettingsRequestsDto: { email },
      });

      expect(status).toBe(401);
    },
  );

  test.fail(
    "BUG XXXXX: POST /api/2.0/settings/sendjoininvite - RoomAdmin cannot send join invite mail",
    async ({ apiSdk }) => {
      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );
      const { email } = apiSdk.faker.generateUser();

      const { data, status } =
        await roomAdminApi.settingsMessages.sendJoinInviteMail({
          adminMessageBaseSettingsRequestsDto: { email },
        });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    },
  );

  test.fail(
    "BUG XXXXX: POST /api/2.0/settings/sendjoininvite - User cannot send join invite mail",
    async ({ apiSdk }) => {
      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );
      const { email } = apiSdk.faker.generateUser();

      const { data, status } =
        await userApi.settingsMessages.sendJoinInviteMail({
          adminMessageBaseSettingsRequestsDto: { email },
        });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    },
  );

  test.fail(
    "BUG XXXXX: POST /api/2.0/settings/sendjoininvite - Guest cannot send join invite mail",
    async ({ apiSdk }) => {
      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );
      const { email } = apiSdk.faker.generateUser();

      const { data, status } =
        await guestApi.settingsMessages.sendJoinInviteMail({
          adminMessageBaseSettingsRequestsDto: { email },
        });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    },
  );
});
