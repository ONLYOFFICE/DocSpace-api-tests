import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// Per-user Telegram notification linking. All 3 methods act on the caller's
// own account only - there is no way to read or change another member's
// link - and none of them need any admin permission, just authentication.
//
// This test portal has no Telegram bot configured (that would need
// `POST api/2.0/settings/authservice` with real bot keys from an actual
// Telegram bot, which this suite has no way to provision), so every call
// here exercises the "no bot configured" path: `checkTelegram` reports
// `unlinked` and `linkTelegram` comes back with no `response` body at all
// (confirmed live, matches the SDK doc: "without a configured bot name the
// response comes back empty").
//
// Gotcha: the SDK's exported `RegStatus` type claims numeric values
// (`unlinked = 0`, `linked = 1`, `linking = 2`), but the live JSON payload
// serializes the status as its string name ("unlinked"), not the number -
// assert against the string, not the `RegStatus` constant.

test.describe("GET /api/2.0/settings/telegram/check - Check the Telegram connection", () => {
  test("Owner is unlinked when no Telegram bot is configured", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .telegram.checkTelegram();

    expect(status).toBe(200);
    expect(data.response?.status).toBe("unlinked");
    expect(data.response?.username).toBeFalsy();
  });
});

test.describe("GET /api/2.0/settings/telegram/link - Get the Telegram link", () => {
  test("Owner gets an empty link when no Telegram bot is configured", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .telegram.linkTelegram();

    expect(status).toBe(200);
    expect(data.response).toBeFalsy();
  });

  test("Calling it twice in a row does not error", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const first = await ownerApi.telegram.linkTelegram();
    const second = await ownerApi.telegram.linkTelegram();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});

test.describe("DELETE /api/2.0/settings/telegram/link - Unlink Telegram", () => {
  test("Owner can unlink even with nothing linked - idempotent, safe to retry", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const first = await ownerApi.telegram.unlinkTelegram();
    expect(first.status).toBe(200);
    expect(first.data.response).toBe(true);

    const second = await ownerApi.telegram.unlinkTelegram();
    expect(second.status).toBe(200);
    expect(second.data.response).toBe(true);
  });
});
