import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// setTenantQuotaSettings PUT /api/2.0/settings/tenantquotasettings — not available in cloud,
// returns 415 "Not available" for all roles. Access control cannot be verified.

test.describe("GET /api/2.0/settings/userquotasettings - access control", () => {
  test("GET /api/2.0/settings/userquotasettings - Anonymous cannot get user quota settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .settingsQuota.getUserQuotaSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/userquotasettings - RoomAdmin cannot get user quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .settingsQuota.getUserQuotaSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("GET /api/2.0/settings/userquotasettings - User cannot get user quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .settingsQuota.getUserQuotaSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("GET /api/2.0/settings/userquotasettings - Guest cannot get user quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .settingsQuota.getUserQuotaSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/roomquotasettings - access control", () => {
  test("POST /api/2.0/settings/roomquotasettings - Anonymous cannot save room quota settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/roomquotasettings - RoomAdmin cannot save room quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("POST /api/2.0/settings/roomquotasettings - User cannot save room quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("POST /api/2.0/settings/roomquotasettings - Guest cannot save room quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .settingsQuota.saveRoomQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/aiagentquotasettings - access control", () => {
  test("POST /api/2.0/settings/aiagentquotasettings - Anonymous cannot save AI agent quota settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/aiagentquotasettings - RoomAdmin cannot save AI agent quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("POST /api/2.0/settings/aiagentquotasettings - User cannot save AI agent quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("POST /api/2.0/settings/aiagentquotasettings - Guest cannot save AI agent quota settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .settingsQuota.saveAiAgentQuotaSettings({
        quotaSettingsRequestsDto: { enableQuota: false, defaultQuota: -1 },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});
