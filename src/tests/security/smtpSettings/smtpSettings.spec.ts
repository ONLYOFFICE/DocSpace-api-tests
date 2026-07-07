import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import config from "@/config";
import { smtpSettingsDto } from "@/src/helpers/smtp-settings";

test.describe("POST /api/2.0/smtpsettings/smtp", () => {
  test("POST /api/2.0/smtpsettings/smtp - Owner saves SMTP settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    expect(status).toBe(200);
    expect(data.response?.host).toBe(config.SMTP_HOST);
    expect(data.response?.port).toBe(config.SMTP_PORT);
    expect(data.response?.senderAddress).toBe(config.SMTP_HOST_LOGIN);
    expect(data.response?.senderDisplayName).toBe("DocSpace Autotest");
    expect(data.response?.enableAuth).toBe(true);
    expect(data.response?.enableSSL).toBe(true);
  });

  test("POST /api/2.0/smtpsettings/smtp - DocSpaceAdmin saves SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    expect(status).toBe(200);
    expect(data.response?.host).toBe(config.SMTP_HOST);
    expect(data.response?.port).toBe(config.SMTP_PORT);
    expect(data.response?.senderAddress).toBe(config.SMTP_HOST_LOGIN);
    expect(data.response?.senderDisplayName).toBe("DocSpace Autotest");
    expect(data.response?.enableAuth).toBe(true);
    expect(data.response?.enableSSL).toBe(true);
  });
});

test.describe("GET /api/2.0/smtpsettings/smtp", () => {
  test("GET /api/2.0/smtpsettings/smtp - Owner gets SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    const { data, status } = await apiSdk
      .forRole("owner")
      .smtpSettings.getSmtpSettings();

    expect(status).toBe(200);
    expect(data.response?.host).toBe(config.SMTP_HOST);
    expect(data.response?.port).toBe(config.SMTP_PORT);
    expect(data.response?.senderAddress).toBe(config.SMTP_HOST_LOGIN);
    expect(data.response?.senderDisplayName).toBe("DocSpace Autotest");
    expect(data.response?.enableAuth).toBe(true);
    expect(data.response?.enableSSL).toBe(true);
  });

  test("GET /api/2.0/smtpsettings/smtp - DocSpaceAdmin gets SMTP settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .smtpSettings.getSmtpSettings();

    expect(status).toBe(200);
    expect(data.response?.host).toBe(config.SMTP_HOST);
    expect(data.response?.port).toBe(config.SMTP_PORT);
    expect(data.response?.senderAddress).toBe(config.SMTP_HOST_LOGIN);
    expect(data.response?.senderDisplayName).toBe("DocSpace Autotest");
    expect(data.response?.enableAuth).toBe(true);
    expect(data.response?.enableSSL).toBe(true);
  });
});

test.describe("GET /api/2.0/smtpsettings/smtp/test", () => {
  test("GET /api/2.0/smtpsettings/smtp/test - Owner sends test email", async ({
    apiSdk,
  }) => {
    await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    const { data, status } = await apiSdk
      .forRole("owner")
      .smtpSettings.testSmtpSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.id).toBe("string");
    expect(data.response?.error).toBe("");
  });

  test("GET /api/2.0/smtpsettings/smtp/test - DocSpaceAdmin sends test email", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .smtpSettings.testSmtpSettings();

    expect(status).toBe(200);
    expect(typeof data.response?.id).toBe("string");
    expect(data.response?.error).toBe("");
  });
});

test.describe("GET /api/2.0/smtpsettings/smtp/test/status", () => {
  test("GET /api/2.0/smtpsettings/smtp/test/status - Owner gets SMTP operation status until completed", async ({
    apiSdk,
  }) => {
    await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    await apiSdk.forRole("owner").smtpSettings.testSmtpSettings();

    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .smtpSettings.getSmtpOperationStatus();

      expect(status).toBe(200);
      expect(data.response?.completed).toBe(true);
      expect(data.response?.error).toBe("");
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
  });

  test("GET /api/2.0/smtpsettings/smtp/test/status - DocSpaceAdmin gets SMTP operation status until completed", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    await apiSdk.forRole("docSpaceAdmin").smtpSettings.testSmtpSettings();

    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .smtpSettings.getSmtpOperationStatus();

      expect(status).toBe(200);
      expect(data.response?.completed).toBe(true);
      expect(data.response?.error).toBe("");
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });
  });
});

test.describe("DELETE /api/2.0/smtpsettings/smtp", () => {
  test("DELETE /api/2.0/smtpsettings/smtp - Owner resets SMTP settings to defaults", async ({
    apiSdk,
  }) => {
    await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    const { data, status } = await apiSdk
      .forRole("owner")
      .smtpSettings.resetSmtpSettings();

    expect(status).toBe(200);
    expect(data.response?.isDefaultSettings).toBe(true);
    expect(data.response?.enableAuth).toBe(false);
    expect(data.response?.enableSSL).toBe(false);
    expect(data.response?.port).toBe(0);
  });

  test("DELETE /api/2.0/smtpsettings/smtp - DocSpaceAdmin resets SMTP settings to defaults", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk
      .forRole("owner")
      .smtpSettings.saveSmtpSettings({ smtpSettingsDto });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .smtpSettings.resetSmtpSettings();

    expect(status).toBe(200);
    expect(data.response?.isDefaultSettings).toBe(true);
    expect(data.response?.enableAuth).toBe(false);
    expect(data.response?.enableSSL).toBe(false);
    expect(data.response?.port).toBe(0);
  });
});
