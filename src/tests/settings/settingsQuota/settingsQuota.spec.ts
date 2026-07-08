import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/userquotasettings - get user quota settings", () => {
  test("GET /api/2.0/settings/userquotasettings - Owner gets user quota settings", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .settingsQuota.getUserQuotaSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.enableQuota).toBe("boolean");
    expect(typeof data.response?.defaultQuota).toBe("number");
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });

  test("GET /api/2.0/settings/userquotasettings - DocSpaceAdmin gets user quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .settingsQuota.getUserQuotaSettings();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.enableQuota).toBe("boolean");
    expect(typeof data.response?.defaultQuota).toBe("number");
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });

});

test.describe("POST /api/2.0/settings/aiagentquotasettings - Owner saves AI agent quota settings", () => {
  test("POST /api/2.0/settings/aiagentquotasettings - Owner disables AI agent quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.enableQuota).toBe(false);
    expect(typeof data.response?.defaultQuota).toBe("number");
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });

  test("POST /api/2.0/settings/aiagentquotasettings - Owner enables AI agent quota with size", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const defaultQuota = 1073741824; // 1 GB in bytes

    const { data, status } = await apiSdk
      .forRole("owner")
      .settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: true, defaultQuota },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.enableQuota).toBe(true);
    expect(data.response?.defaultQuota).toBe(defaultQuota);
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });
});

// setTenantQuotaSettings PUT /api/2.0/settings/tenantquotasettings is not automatable
// in a cloud-hosted DocSpace environment — the API returns 415 "Not available".
// This endpoint is available only in on-premise (Server) installations
// where multi-tenant quota management is supported.

test.describe("POST /api/2.0/settings/roomquotasettings - Owner saves room quota settings", () => {
  test("POST /api/2.0/settings/roomquotasettings - Owner disables room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.enableQuota).toBe(false);
    expect(typeof data.response?.defaultQuota).toBe("number");
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });

  test("POST /api/2.0/settings/roomquotasettings - Owner enables room quota with size", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const defaultQuota = 1073741824; // 1 GB in bytes

    const { data, status } = await apiSdk
      .forRole("owner")
      .settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: true, defaultQuota },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.enableQuota).toBe(true);
    expect(data.response?.defaultQuota).toBe(defaultQuota);
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });
});

test.describe("POST /api/2.0/settings/roomquotasettings - DocSpaceAdmin saves room quota settings", () => {
  test("POST /api/2.0/settings/roomquotasettings - DocSpaceAdmin disables room quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.enableQuota).toBe(false);
    expect(typeof data.response?.defaultQuota).toBe("number");
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });

  test("POST /api/2.0/settings/roomquotasettings - DocSpaceAdmin enables room quota with size", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const defaultQuota = 1073741824; // 1 GB in bytes

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: true, defaultQuota },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.enableQuota).toBe(true);
    expect(data.response?.defaultQuota).toBe(defaultQuota);
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });
});

test.describe("POST /api/2.0/settings/aiagentquotasettings - DocSpaceAdmin saves AI agent quota settings", () => {
  test("POST /api/2.0/settings/aiagentquotasettings - DocSpaceAdmin disables AI agent quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.enableQuota).toBe(false);
    expect(typeof data.response?.defaultQuota).toBe("number");
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });

  test("POST /api/2.0/settings/aiagentquotasettings - DocSpaceAdmin enables AI agent quota with size", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const defaultQuota = 1073741824; // 1 GB in bytes

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: true, defaultQuota },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.enableQuota).toBe(true);
    expect(data.response?.defaultQuota).toBe(defaultQuota);
    expect(
      !isNaN(
        new Date(data.response?.lastModified as unknown as string).getTime(),
      ),
    ).toBe(true);
  });
});
