import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiSettings } from "@/src/helpers/ai-settings";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  listFolderFiles,
  waitForExportToSettle,
  waitForExportedFile,
} from "@/src/helpers/text-to-docx";

// The AI switch as it applies to `POST /api/2.0/ai/text-to-docx`, the endpoint
// that replaced the removed `POST /ai/messages/{messageId}/export`.
//
// There are two independent ways AI can be off on a portal and they do NOT
// behave the same way here:
//
//   * the portal AI switch (`PUT /settings/ai-access`) turns the export into a
//     403 — even for the Owner, and even though the export itself never talks
//     to the AI gateway;
//   * the unpaid "AI Tools" wallet service, which is the state every fresh test
//     portal starts in, does not block it at all.
//
// Each test proves a transition rather than an end state: a test that only
// asserted 403 after flipping the switch would also pass if the endpoint were
// permanently forbidden, or if flipping the switch had silently failed.

test.describe("AI Messages - AI Disabled", () => {
  test("POST /api/2.0/ai/text-to-docx - returns 403 when the portal AI switch is off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const beforeTitle = `Exported before ${apiSdk.faker.generateString(6)}`;
    const before = await aiSettings.textToDocx("owner", {
      title: beforeTitle,
      content: "The assistant said hello.",
      folderId,
    });
    expect(before.status).toBe(202);
    expect(
      await waitForExportedFile(ownerApi, folderId, `${beforeTitle}.docx`),
      "the export has to work before the switch is flipped",
    ).toBeDefined();

    const disabled = await setPortalAiAccess(ownerApi, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);

    const afterTitle = `Exported after ${apiSdk.faker.generateString(6)}`;
    const { status, error } = await aiSettings.textToDocx("owner", {
      title: afterTitle,
      content: "The assistant said hello.",
      folderId,
    });

    // 202 is asynchronous, so a refusal has to be checked for a document too.
    // The document from before the flip doubles as the positive control: if it
    // were missing, the listing would not be trustworthy enough to conclude the
    // second one was never created.
    await waitForExportToSettle();
    const titles = (await listFolderFiles(ownerApi, folderId)).map(
      (file) => file.title,
    );
    expect(titles).toContain(`${beforeTitle}.docx`);
    expect(titles).not.toContain(`${afterTitle}.docx`);
    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/text-to-docx - body validation runs before the AI switch is checked", async ({
    apiSdk,
  }) => {
    // Worth pinning because it is a trap for the test above: with the switch off
    // an invalid body still answers 400, so an off-state test that sends an
    // incomplete body would never see the 403 it claims to assert.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const disabled = await setPortalAiAccess(ownerApi, false);
    expect(disabled.writeStatus).toBe(200);
    expect(disabled.enabled).toBe(false);

    const { status, error } = await aiSettings.textToDocx("owner", {
      content: "hello",
      folderId,
    });

    expect(error).toBe("title and content are required");
    expect(status).toBe(400);
  });

  test("POST /api/2.0/ai/text-to-docx - exports text without a paid AI Tools service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Pinned as NOT AI-gated: the export is a document-builder job that never
    // reaches the AI gateway, so an unpaid portal still gets its file — and
    // paying for the service changes nothing about it.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const { data: unpaidConfig } = await ownerApi.aiSettings.getAiSettings();
    expect(unpaidConfig.response?.aiReady).toBe(false);

    const unpaidTitle = `Exported unpaid ${apiSdk.faker.generateString(6)}`;
    const unpaid = await aiSettings.textToDocx("owner", {
      title: unpaidTitle,
      content: "The assistant said hello.",
      folderId,
    });
    expect(unpaid.status).toBe(202);
    expect(unpaid.data?.success).toBe(true);
    expect(
      await waitForExportedFile(ownerApi, folderId, `${unpaidTitle}.docx`),
    ).toBeDefined();

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const paidTitle = `Exported paid ${apiSdk.faker.generateString(6)}`;
    const paid = await aiSettings.textToDocx("owner", {
      title: paidTitle,
      content: "The assistant said hello.",
      folderId,
    });
    expect(paid.status).toBe(202);
    expect(
      await waitForExportedFile(ownerApi, folderId, `${paidTitle}.docx`),
    ).toBeDefined();

    const files = await listFolderFiles(ownerApi, folderId);
    expect(
      files.filter((file) => file.title.startsWith("Exported ")).length,
    ).toBe(2);
  });
});
