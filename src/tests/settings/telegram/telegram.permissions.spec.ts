import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// All 3 methods act on the caller's own account and need no admin
// permission - just authentication - so the only access-control dimension
// worth checking is "any authenticated role can, Anonymous cannot".

test.describe("GET /api/2.0/settings/telegram/check - access control", () => {
  test("User (non-admin) can check their own Telegram connection", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.telegram.checkTelegram();
    expect(status).toBe(200);
  });

  test("Guest can check their own Telegram connection", async ({ apiSdk }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.telegram.checkTelegram();
    expect(status).toBe(200);
  });

  test("Anonymous cannot check the Telegram connection", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().telegram.checkTelegram();
    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/settings/telegram/link - access control", () => {
  test("Anonymous cannot get a Telegram link", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().telegram.linkTelegram();
    expect(status).toBe(401);
  });
});

test.describe("DELETE /api/2.0/settings/telegram/link - access control", () => {
  test("Anonymous cannot unlink Telegram", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().telegram.unlinkTelegram();
    expect(status).toBe(401);
  });
});
