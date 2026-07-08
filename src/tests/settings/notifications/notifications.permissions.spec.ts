import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { NotificationType } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/settings/notification - access control", () => {
  test("POST /api/2.0/settings/notification - Anonymous cannot set notification settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .notifications.setNotificationSettings({
        notificationSettingsRequestsDto: {
          type: NotificationType.Badges,
          isEnabled: true,
        },
      });

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/settings/notification/rooms - access control", () => {
  test("POST /api/2.0/settings/notification/rooms - Anonymous cannot mute room notifications", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .notifications.setRoomsNotificationStatus({
        roomsNotificationsSettingsRequestDto: {
          roomsId: 1 as unknown as any,
          mute: true,
        },
      });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/notification/rooms - access control", () => {
  test("GET /api/2.0/settings/notification/rooms - Anonymous cannot get rooms notification settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .notifications.getRoomsNotificationSettings();

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/notification/{type} - access control", () => {
  test("GET /api/2.0/settings/notification/{type} - Anonymous cannot get notification settings by type", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .notifications.getNotificationSettings({ type: NotificationType.Badges });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/notification/channels - access control", () => {
  test("GET /api/2.0/settings/notification/channels - Anonymous cannot get notification channels", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .notifications.getNotificationChannels();

    expect(status).toBe(401);
  });
});
