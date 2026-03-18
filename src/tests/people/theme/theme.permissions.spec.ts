import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /people/theme - Edge cases", () => {
  test("GET /people/theme - 401 when unauthorized", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().theme.getPortalTheme();

    expect(status).toBe(401);
  });
});

test.describe("PUT /people/theme - Edge cases", () => {
  test("PUT /people/theme - 401 when unauthorized", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().theme.changePortalTheme({
      darkThemeSettingsRequestDto: { theme: "Dark" },
    });

    expect(status).toBe(401);
  });
});
