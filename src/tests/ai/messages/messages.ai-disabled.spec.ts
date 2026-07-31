import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

// SKIPPED: these cover POST /api/2.0/ai/messages/{messageId}/export and
// POST /api/2.0/ai/chats/{chatId}/messages/export, both of which now answer 404.
// Message export was replaced by POST /api/2.0/ai/text-to-docx, which takes the
// text itself instead of a message id — see messages.spec.ts.
//
// Kept rather than deleted because the endpoint may come back. If it does, drop
// the .skip on the describes below and re-verify: the setup here drives the
// removed chat surface (/ai/rooms/{roomId}/chats, also 404, now /ai/threads/*),
// and the error envelope has changed to {"error":"..."} with no statusCode and
// no error.message.
//
// Bugs these tests tracked, still unverified against any replacement:
// BUG 80770 (export without agent membership), BUG 80772 (export with Viewer
// role), BUG 80779 (messageId 0 / -1 validation).

test.describe.skip("AI Messages - AI Disabled", () => {
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
