import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiSettings } from "@/src/helpers/ai-settings";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  configureAiToolsAsUnpaid,
  enableAiGateway,
} from "@/src/helpers/wallet-services";
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
// The first and the third test prove a transition rather than an end state: a
// test that only asserted 403 after flipping the switch would also pass if the
// endpoint were permanently forbidden, or if flipping the switch had silently
// failed. Both start by putting the portal into the state they claim to start
// from instead of trusting the defaults of a fresh portal.
//
// The second test is deliberately NOT a transition — it pins the order in which
// the endpoint validates, which only shows up in the off-state.

test.describe("AI Messages - AI Disabled", () => {
  test("POST /api/2.0/ai/text-to-docx - returns 403 when the portal AI switch is off", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // The starting state is set explicitly rather than assumed: this test claims
    // an enabled -> disabled transition, and if a fresh portal ever stopped
    // shipping with AI on it would fail at the positive control below while the
    // contract under test had not changed at all.
    const enabled = await setPortalAiAccess(ownerApi, true);
    expect(enabled.writeStatus).toBe(200);
    expect(enabled.enabled).toBe(true);

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

  test("POST /api/2.0/ai/text-to-docx - exports text both before and after AI Tools is enabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Pinned as NOT AI-gated: the export is a document-builder job that never
    // reaches the AI gateway, so an unpaid portal still gets its file — and
    // paying for the service changes nothing about it.
    //
    // The paid half is not strictly part of "works while unpaid", but it is what
    // makes the unpaid 202 mean something: it shows the endpoint is indifferent
    // to the wallet rather than merely happening to answer on this portal. The
    // title says both halves so nobody trims it back to one and keeps the name.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // Explicit about the state instead of trusting a fresh portal to be unpaid:
    // the switch is turned on and AI Tools is asserted to be absent from the
    // enabled wallet services, so `aiReady: false` below can only come from the
    // wallet.
    await configureAiToolsAsUnpaid(ownerApi);

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

    // Tied to the two titles this test generated, not to a count of everything
    // that happens to start with "Exported " — the second export must not have
    // replaced the first one, and only these two files can show that.
    const titles = (await listFolderFiles(ownerApi, folderId)).map(
      (file) => file.title,
    );
    expect(titles).toContain(`${unpaidTitle}.docx`);
    expect(titles).toContain(`${paidTitle}.docx`);
  });
});
