import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { smtpSettingsDto } from "@/src/helpers/smtp-settings";

test.describe("GET /api/2.0/smtpsettings/smtp - permissions", () => {
  test("GET /api/2.0/smtpsettings/smtp - Anonymous cannot get SMTP settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .smtpSettings.getSmtpSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/smtpsettings/smtp - RoomAdmin cannot get SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .smtpSettings.getSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/smtpsettings/smtp - User cannot get SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .smtpSettings.getSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/smtpsettings/smtp - Guest cannot get SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .smtpSettings.getSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/smtpsettings/smtp/test/status - permissions", () => {
  test("GET /api/2.0/smtpsettings/smtp/test/status - Anonymous cannot get SMTP operation status", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .smtpSettings.getSmtpOperationStatus();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/smtpsettings/smtp/test/status - RoomAdmin cannot get SMTP operation status", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .smtpSettings.getSmtpOperationStatus();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/smtpsettings/smtp/test/status - User cannot get SMTP operation status", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .smtpSettings.getSmtpOperationStatus();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/smtpsettings/smtp/test/status - Guest cannot get SMTP operation status", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .smtpSettings.getSmtpOperationStatus();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/smtpsettings/smtp/test - permissions", () => {
  test("GET /api/2.0/smtpsettings/smtp/test - Anonymous cannot send test email", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .smtpSettings.testSmtpSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/smtpsettings/smtp/test - RoomAdmin cannot send test email", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .smtpSettings.testSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/smtpsettings/smtp/test - User cannot send test email", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .smtpSettings.testSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/smtpsettings/smtp/test - Guest cannot send test email", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .smtpSettings.testSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/smtpsettings/smtp - permissions", () => {
  test("POST /api/2.0/smtpsettings/smtp - Anonymous cannot save SMTP settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/smtpsettings/smtp - RoomAdmin cannot save SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/smtpsettings/smtp - User cannot save SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/smtpsettings/smtp - Guest cannot save SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

const TOO_LONG = "a".repeat(256);

test.describe("POST /api/2.0/smtpsettings/smtp - field length validation", () => {
  test("POST /api/2.0/smtpsettings/smtp - host exceeds 255 characters", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({
        smtpSettingsDto: { ...smtpSettingsDto, host: TOO_LONG },
      });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.Host[0]).toBe(
      "The field Host must be a string with a maximum length of 255.",
    );
  });

  test("POST /api/2.0/smtpsettings/smtp - senderAddress exceeds 255 characters", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({
        smtpSettingsDto: { ...smtpSettingsDto, senderAddress: TOO_LONG },
      });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.SenderAddress[0]).toBe(
      "The field SenderAddress must be a string with a maximum length of 255.",
    );
  });

  test("POST /api/2.0/smtpsettings/smtp - senderDisplayName exceeds 255 characters", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({
        smtpSettingsDto: { ...smtpSettingsDto, senderDisplayName: TOO_LONG },
      });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.SenderDisplayName[0]).toBe(
      "The field SenderDisplayName must be a string with a maximum length of 255.",
    );
  });

  test("POST /api/2.0/smtpsettings/smtp - credentialsUserName exceeds 255 characters", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({
        smtpSettingsDto: { ...smtpSettingsDto, credentialsUserName: TOO_LONG },
      });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.CredentialsUserName[0]).toBe(
      "The field CredentialsUserName must be a string with a maximum length of 255.",
    );
  });
});

test.describe("DELETE /api/2.0/smtpsettings/smtp - permissions", () => {
  test("DELETE /api/2.0/smtpsettings/smtp - Anonymous cannot reset SMTP settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .smtpSettings.resetSmtpSettings();

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/smtpsettings/smtp - RoomAdmin cannot reset SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .smtpSettings.resetSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/smtpsettings/smtp - User cannot reset SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .smtpSettings.resetSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/smtpsettings/smtp - Guest cannot reset SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .smtpSettings.resetSmtpSettings();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});
