import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("AI Vectorization - AI Disabled", () => {
  test("POST /api/2.0/ai/vectorization - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.vectorization.startTask({
      vectorizationStartRequestBody: { files: new Set([1]) },
    });

    expect(status).toBe(403);
  });
});
