import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/ssov2/default - access control", () => {
  test("User (non-admin) cannot read the default SSO settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.sso.getDefaultSsoSettingsV2();
    expect(status).toBe(403);
  });

  test("DocSpaceAdmin can read the default SSO settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.sso.getDefaultSsoSettingsV2();
    expect(status).toBe(200);
  });

  test("Anonymous cannot read the default SSO settings", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .sso.getDefaultSsoSettingsV2();
    expect(status).toBe(401);
  });

  test("RoomAdmin cannot read the default SSO settings - treated like a regular user, not elevated", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.sso.getDefaultSsoSettingsV2();
    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/ssov2/constants - access control", () => {
  test("User (non-admin) can read the SSO settings constants", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.sso.getSsoSettingsV2Constants();
    expect(status).toBe(200);
  });

  test("Anonymous cannot read the SSO settings constants", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .sso.getSsoSettingsV2Constants();
    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/ssov2 - access control", () => {
  test("User (non-admin) cannot read the current SSO settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.sso.getSsoSettingsV2();
    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/settings/ssov2 - access control", () => {
  test("User (non-admin) cannot save the SSO settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.sso.saveSsoSettingsV2({
      ssoSettingsRequestDto: { serializeSettings: "{}" },
    });
    expect(status).toBe(403);
  });

  test("Anonymous cannot save the SSO settings", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().sso.saveSsoSettingsV2({
      ssoSettingsRequestDto: { serializeSettings: "{}" },
    });
    expect(status).toBe(401);
  });
});

test.describe("DELETE /api/2.0/settings/ssov2 - access control", () => {
  test("User (non-admin) cannot reset the SSO settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.sso.resetSsoSettingsV2();
    expect(status).toBe(403);
  });

  test("Anonymous cannot reset the SSO settings", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().sso.resetSsoSettingsV2();
    expect(status).toBe(401);
  });
});
