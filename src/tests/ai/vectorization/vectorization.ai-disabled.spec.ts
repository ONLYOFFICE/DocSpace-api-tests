import { expect } from "@playwright/test";
import { VectorizationStatus } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import {
  configureAiToolsAsUnpaid,
  enableWalletService,
  isWalletServiceEnabled,
} from "@/src/helpers/wallet-services";
import {
  createAgentWithKnowledgeFolder,
  createKnowledgeFile,
  waitForVectorization,
} from "@/src/helpers/ai-vectorization";
import { ApiSDK } from "@/src/services/api-sdk";

/**
 * No file has this id. Measured 2026-08-20: startTask now 404s on it in every
 * portal state — it used to be accepted with 200 regardless of wallet state
 * (BUG 80736's era). Still useful here: a plain 404 is what tells "not
 * wallet-gated" apart from a 402/403 naming the AI Tools service.
 */
const MISSING_FILE_ID = 999999999;

// `POST /api/2.0/ai/vectorization/tasks` in the two states that turn AI off.
// They do not behave the same way: the portal AI switch refuses the call, while
// an unpaid "AI Tools" wallet service does not gate it at all.

test.describe("AI Vectorization - AI Disabled", () => {
  test("POST /api/2.0/ai/vectorization/tasks - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.commonSettings.setTenantAiAccessSettings({
      tenantAiAccessSettingsDto: { enabled: false },
    });

    const { status } = await ownerApi.vectorization.aiVectorizationStartTask({
      requestBody: { files: new Set([1]) },
    });

    expect(status).toBe(403);
  });
});

// Measured on a live portal on 2026-08-03: the unpaid "AI Tools" wallet service
// does not gate `POST /ai/vectorization/tasks` itself, but there is nothing for
// it to index — a file cannot be added to an agent's Knowledge folder at all
// until the service is enabled. Owner included, and the message is a plain
// `403 Access denied` from the files controller.
//
// So the honest scope of this test is a pair of facts plus their cause, and it
// is written as a transition for exactly that reason. Paying for the portal and
// topping the wallet up is checked in between: without that step, the final 200
// could just as well be the effect of the payment, and the test would be
// attributing the gate to the wrong thing.

test.describe("AI Vectorization - AI Tools wallet service not paid for", () => {
  test("POST /api/2.0/ai/vectorization/tasks - the route is accepted while AI Tools is unpaid, but a Knowledge file cannot be added until the service is enabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await configureAiToolsAsUnpaid(ownerApi);

    // Creating the agent and resolving its Knowledge folder is not gated.
    const { knowledgeFolderId } = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest Unpaid Wallet Vectorization Agent",
    );

    await test.step("the task route itself is not wallet-gated", async () => {
      // A missing id 404s in every portal state now, which is all that is
      // needed to show the route is reachable while unpaid — a 402/403 naming
      // the wallet service would be the gate this test is looking for.
      const { status } = await ownerApi.vectorization.aiVectorizationStartTask({
        requestBody: { files: new Set([MISSING_FILE_ID]) },
      });
      expect(status).toBe(404);
    });

    await test.step("no Knowledge file can be created while AI Tools is unpaid", async () => {
      const { status } = await createKnowledgeFileRaw(
        ownerApi,
        knowledgeFolderId,
        "Autotest Unpaid Wallet File.docx",
      );
      expect(status).toBe(403);
    });

    await test.step("paying for the portal is not what unblocks it", async () => {
      await paymentsApi.setupPayment();
      await paymentsApi.makeWalletTopUp(1000);
      expect(
        await isWalletServiceEnabled(ownerApi.payment, "aiTools"),
        "AI Tools must still be off after a portal payment",
      ).toBe(false);

      const { status } = await createKnowledgeFileRaw(
        ownerApi,
        knowledgeFolderId,
        "Autotest Portal Paid File.docx",
      );
      expect(status).toBe(403);
    });

    await test.step("enabling the AI Tools wallet service is", async () => {
      await enableWalletService(ownerApi.payment, "aiTools");
      expect(
        await isWalletServiceEnabled(ownerApi.payment, "aiTools"),
        "AI Tools read back after enabling it",
      ).toBe(true);

      const fileId = await createKnowledgeFile(
        ownerApi,
        knowledgeFolderId,
        "Autotest Wallet Paid File.docx",
      );

      const { status } = await ownerApi.vectorization.aiVectorizationStartTask({
        requestBody: { files: new Set([fileId]) },
      });
      expect(status).toBe(200);

      // The file really ends up indexed — with no AI credit ever added, so the
      // AI balance is not part of this gate either. This does not claim the
      // startTask above caused it: Knowledge-folder files are auto-vectorized and
      // there is no per-task read route to attribute the transition with.
      expect(await waitForVectorization(ownerApi, fileId)).toBe(
        VectorizationStatus.Completed,
      );
    });
  });
});

/** Like `createKnowledgeFile`, but hands the status back instead of throwing. */
function createKnowledgeFileRaw(
  api: ReturnType<ApiSDK["forRole"]>,
  knowledgeFolderId: number,
  title: string,
) {
  return api.files.createFile({
    folderId: knowledgeFolderId,
    createFileJsonElement: { title },
  });
}
