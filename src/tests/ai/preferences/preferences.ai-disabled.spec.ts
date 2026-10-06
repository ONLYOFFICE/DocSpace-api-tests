import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { AiPreferences } from "@/src/helpers/ai-preferences";
import { AiSettings } from "@/src/helpers/ai-settings";

// With the portal AI switch off, the AI routes answer 403 — deep mode among them
// (preferences.permission.spec.ts). The expectation is that the tool permission
// mode follows: its whole point is deciding whether AI tool calls need approval,
// and with AI off there are none. The refusal belongs ahead of validation, so a
// body that would be a 400 is a 403 as well.
//
// Measured 2026-10-05: it does not. GET and PUT answer 200, the write sticks and
// survives switching AI back on; only an invalid body is refused, with 400. Note
// that GET /ai/config/user, which also reports the mode, is pinned as NOT gated
// by the switch (settings.ai-disabled.spec.ts) — whether the preferences route
// should follow the config route or the other preferences is for the developers
// to say, and the BUG number below is a placeholder until it is filed.

test.describe("AI Preferences - tool permission mode with AI disabled", () => {
  test("BUG XXXXX: GET|PUT /api/2.0/ai/preferences/*-tool-permission-mode - both are refused when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.fail();

    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const settings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // Stored while AI is on, so "unchanged" below is a fact about a value.
    expect(
      (await preferences.setToolPermissionMode("owner", { value: "allow" }))
        .status,
    ).toBe(200);
    expect((await preferences.getToolPermissionMode("owner")).data).toBe(
      "allow",
    );

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.writeStatus).toBe(200);
    expect(off.enabled, "the switch reads back as off").toBe(false);

    // The control that the switch is in effect: the sibling preference is refused.
    expect((await preferences.getDeepMode("owner")).status).toBe(403);

    const read = await preferences.getToolPermissionMode("owner");
    const write = await preferences.setToolPermissionMode("owner", {
      value: "ask",
    });
    const invalid = await preferences.setToolPermissionMode("owner", {
      value: "sometimes",
    });

    // The side effects first. The config route is still readable while AI is
    // off, so it shows whether the refused write got through; re-enabling shows
    // the stored value itself.
    expect(
      (await settings.getUserConfig("owner")).data?.response
        ?.toolPermissionMode,
      "the refused write changed nothing",
    ).toBe(2);
    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled, "the switch reads back as on").toBe(true);
    expect(
      (await preferences.getToolPermissionMode("owner")).data,
      "the stored mode is the one set while AI was on",
    ).toBe("allow");

    expect(read.status, "GET").toBe(403);
    expect(write.status, "PUT with a valid value").toBe(403);
    expect(
      invalid.status,
      "PUT with an invalid value: the AI-access check comes before validation",
    ).toBe(403);
  });
});
