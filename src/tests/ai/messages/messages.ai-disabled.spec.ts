import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("AI Messages - AI Disabled", () => {
  test("POST /api/2.0/ai/messages/:messageId/export - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.messages.exportMessage({
      messageId: 1,
      exportMessageRequestBody: {
        folderId: 1,
        title: "Exported AI Message",
      },
    });

    expect(status).toBe(403);
  });
});
