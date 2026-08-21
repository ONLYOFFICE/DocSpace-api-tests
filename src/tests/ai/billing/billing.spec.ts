import { expect } from "@playwright/test";
import { OperationDto } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import {
  accountingPeriod,
  disableWalletService,
  enableAiGateway,
  getServiceOperations,
  getServiceUsage,
  getWalletBalance,
  operationDate,
  operationKey,
  waitForMatchingServiceOperation,
  waitForServiceOperation,
  walletServiceNames,
} from "@/src/helpers/wallet-services";
import {
  AiAgentChat,
  expectHealthyAssistantReply,
  inviteToAgent,
} from "@/src/helpers/ai-agent-chat";
import { AgentRole } from "@/src/helpers/ai-http";
import { createAgentWithKnowledgeFolder } from "@/src/helpers/ai-vectorization";
import { uploadFileToFolder } from "@/src/helpers/upload-file";
import { ApiSDK } from "@/src/services/api-sdk";

// "AI usage shows up in Billing as an add-on of its own, with its spend and its
// usage" — the AI Tools half of that requirement, which is the meter every AI
// feature burns:
//
//   GET /portal/payment/customer/operations?serviceName=ai-tools  — charge by charge
//   GET /portal/payment/customer/usage?serviceName=ai-tools       — the add-on's own row
//   GET /portal/payment/customer/balance                          — the wallet it is paid from
//
// The two neighbouring pieces live elsewhere on purpose: the catalogue side (both
// AI add-ons have their own id, name and price under `walletservices`, and the
// spend export under `customer/operationsreport`) is in
// portal/payments/payment.spec.ts, and the AI *search* add-on — the second AI
// meter, sold in Results rather than Tokens — is in ai/web-search/web-search.spec.ts.
//
// Two measurements shape everything below (2026-08-19):
//
//   * the add-on is one meter with a row per feature: `description` says which
//     feature was billed ("Chat", "Vectorization"), `details` names the model it
//     ran on ("Gemini 3.5 Flash", "Text Embedding 3 Small"), and `customer/usage`
//     sums them under the title "AI features".
//   * the spend is debited from the ordinary wallet balance. The AI sub-account
//     (`customer/aibalance`, `creditaibalance`) answers 404 on these portals, so
//     `customer/balance` is where the money visibly moves.
//   * `agentId`/`agentTitle` are the report's Source column, and an empty Source
//     is not automatically a defect: a chat sent with no `entityId` belongs to no
//     agent. Which chat produced the row is what decides — the two tests around
//     the middle of this file are that pair.
//
// Every test here has to spend real money on a real model before it can read the
// billing side back, so all of them share two rules:
//
//   * the reply is asserted healthy first (`expectHealthyAssistantReply`). A
//     refused inference is still stored as an assistant message, and a portal
//     where AI is dead would otherwise reach the billing assertions with nothing
//     to bill — turning "no charge appeared" into a green absence check.
//   * a charge is looked for by operation key, never by row count. The portal is
//     charged for other things while the test runs (storage is billed hourly),
//     so "one row more than before" also passes on someone else's charge landing
//     in the same window. `OperationDto` carries no id, hence the key tuple.

/** Keeps the answers short: tokens are what is being billed here. */
const SHORT_ANSWER_PROMPT = "Answer in one short sentence.";
const BILLED_QUESTION = "In one short sentence: what is a spreadsheet for?";

// `description` is how the wallet report says which AI feature the tokens went
// on, and it is also the only way to pick one feature's charge out of a portal
// that is billing several: an answer produced against a filled Knowledge folder
// lands a `Chat` row *and* a `Vectorization` row for the embedded question.
const isChatCharge = (operation: OperationDto) =>
  operation.description === "Chat";
const isVectorizationCharge = (operation: OperationDto) =>
  operation.description === "Vectorization";

/**
 * Drops enough text into an agent's Knowledge folder to be worth embedding.
 * DocSpace indexes whatever lands there by itself, so this is all it takes to
 * make the portal spend on the embedding model — an empty file would leave
 * "nothing was billed" ambiguous between "not billed" and "nothing to embed".
 */
async function uploadKnowledgeText(
  apiSdk: ApiSDK,
  knowledgeFolderId: number,
  fileName: string,
) {
  const text = Array.from(
    { length: 40 },
    (_, index) =>
      `Paragraph ${index}: ONLYOFFICE DocSpace organises documents in rooms, and every room has its own access model.`,
  ).join("\n");

  const { status } = await uploadFileToFolder(
    apiSdk,
    "owner",
    knowledgeFolderId,
    Buffer.from(text, "utf-8"),
    fileName,
    { mimeType: "text/plain" },
  );
  expect(status, `uploading ${fileName} into the Knowledge folder`).toBe(200);
}

/**
 * Burns AI Tools tokens for real and returns what was spent where, so the
 * billing assertions can be tied to a named agent and a real reply rather than
 * to "some charge on this portal".
 */
async function spendOnAiTools(
  aiChat: AiAgentChat,
  role: AgentRole,
  options: { agentId: number; profileId: string; threadTitle: string },
) {
  const threadId = await aiChat.createThreadId(role, {
    title: options.threadTitle,
    profileId: options.profileId,
    agentId: options.agentId,
  });

  await aiChat.sendMessage(role, {
    threadId,
    agentId: options.agentId,
    profileId: options.profileId,
    message: BILLED_QUESTION,
    timeoutMs: 240000,
  });

  const messages = await aiChat.waitForAssistantReply(role, threadId);
  expectHealthyAssistantReply(messages);

  return { threadId, messages };
}

test.describe("AI usage - billed to the AI Tools add-on", () => {
  test("GET /api/2.0/portal/payment/customer/operations, customer/usage - an AI chat reply is charged to ai-tools", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const ownerId = await aiChat.whoAmI("owner");

    const before = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );
    const usageBefore = await getServiceUsage(ownerApi.payment, "aiTools");

    // The profile, not just its id: the charge is expected to name the model it
    // was spent on, and that name has to come from the catalogue rather than
    // from a string hard-coded here — the gateway's model line-up changes.
    const profile = AiAgentChat.pickTextProfile(
      await aiChat.listProfiles("owner"),
    );
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Billed Agent",
      profileId: profile.id,
      prompt: SHORT_ANSWER_PROMPT,
    });
    await spendOnAiTools(aiChat, "owner", {
      agentId,
      profileId: profile.id,
      threadTitle: "Billed chat",
    });

    const charged = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      before,
      isChatCharge,
    );
    expect(
      charged,
      "an answer the model really produced must be billed to ai-tools",
    ).toBeDefined();
    expect(charged?.service).toBe(walletServiceNames.aiTools);
    // Tokens, not Results: its own unit next to the AI search meter is what makes
    // this an add-on of its own rather than a line in someone else's total.
    expect(charged?.serviceUnit).toBe("Tokens");
    expect(charged?.quantity).toBeGreaterThan(0);
    expect(charged?.currency).toBe("USD");
    // "Spend" means money left the wallet, not just that a row was written.
    expect(charged?.debit).toBeGreaterThan(0);
    expect(charged?.credit).toBe(0);
    // Charged to the person who chatted — the grouping the billing page offers.
    expect(charged?.participantName).toBe(ownerId);
    expect(charged?.participantDisplayName?.length).toBeGreaterThan(0);
    expect(operationDate(charged!)).toBeTruthy();
    // What the spend was for, in the two columns the wallet report shows: the
    // feature ("Chat") and the model it ran on. `details` is the closest thing to
    // a per-model breakdown the API offers.
    expect(charged?.description).toBe("Chat");
    expect(charged?.details).toBe(profile.name);
    // A string, despite `OperationType` being a numeric enum in the SDK. AI usage
    // is booked as an ordinary service payment — the AI-specific members of that
    // enum (`AiServicePayment`, `AiDebit`) are not what a chat produces.
    expect(String(charged?.type)).toBe("ServicePayment");

    // The aggregate the add-on's card reads: same service, same unit, and it grew
    // by this conversation.
    const usageAfter = await getServiceUsage(ownerApi.payment, "aiTools");
    expect(usageAfter?.service).toBe(walletServiceNames.aiTools);
    // The add-on's name in Billing. This is the row the requirement is about, so
    // the title is part of the contract, not incidental.
    expect(usageAfter?.title).toBe("AI features");
    expect(usageAfter?.serviceUnit).toBe("Tokens");
    expect(usageAfter?.totalQuantity ?? 0).toBeGreaterThan(
      usageBefore?.totalQuantity ?? 0,
    );
    expect(usageAfter?.totalAmount ?? 0).toBeGreaterThan(
      usageBefore?.totalAmount ?? 0,
    );
    expect(usageAfter?.operationCount ?? 0).toBeGreaterThan(
      usageBefore?.operationCount ?? 0,
    );
    expect(usageAfter?.currency).toBe("USD");

    // Usage-billed rather than subscribed: the add-on has no periodic price, it
    // has consumption. Neither field is in the SDK's DTO, hence the cast.
    const billing = usageAfter as unknown as {
      price?: number;
      subscription?: boolean;
    };
    expect(billing.subscription).toBe(false);
    expect(billing.price).toBe(0);

    // And the total is the sum of the very rows `customer/operations` lists for
    // the same period — without this the card could show a number that belongs to
    // no charges anyone can look up.
    const rows = await getServiceOperations(ownerApi.payment, "aiTools");
    // `getServiceOperations` reads one page of 100; the reconciliation below only
    // holds while every row of the period is on it.
    expect(rows.length).toBeLessThan(100);
    const debited = rows.reduce((sum, row) => sum + (row.debit ?? 0), 0);
    const quantity = rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0);
    expect(usageAfter?.operationCount).toBe(rows.length);
    expect(usageAfter?.totalAmount).toBeCloseTo(debited, 6);
    expect(usageAfter?.totalQuantity).toBe(quantity);
  });

  test("GET /api/2.0/portal/payment/customer/operations, customer/usage - two AI features share the add-on's meter", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const { agentId, knowledgeFolderId } = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      "Autotest Meter Agent",
    );

    const beforeIndexing = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );

    // Indexing a Knowledge file runs an embedding model, and that is a different
    // AI feature from chatting — a different model, a different price. Both are
    // sold as "AI features", so both have to land on this one add-on.
    await uploadKnowledgeText(apiSdk, knowledgeFolderId, "meter-source.txt");
    const indexing = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      beforeIndexing,
      isVectorizationCharge,
    );
    expect(indexing, "indexing a Knowledge file must be billed").toBeDefined();
    expect(indexing?.service).toBe(walletServiceNames.aiTools);
    expect(indexing?.description).toBe("Vectorization");
    expect(indexing?.serviceUnit).toBe("Tokens");
    expect(indexing?.debit).toBeGreaterThan(0);

    const beforeChat = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );
    const profileId = await aiChat.defaultProfileId("owner");
    await spendOnAiTools(aiChat, "owner", {
      agentId,
      profileId,
      threadTitle: "Metered chat",
    });
    const chat = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      beforeChat,
      isChatCharge,
    );
    expect(chat, "the chat must be billed").toBeDefined();

    // Same meter, told apart by what they were spent on: the feature in
    // `description` and the model in `details`. Without this the rows would be
    // one undifferentiated "AI" total.
    expect(chat?.details).not.toBe(indexing?.details);
    expect(indexing?.details?.length).toBeGreaterThan(0);
    expect(chat?.details?.length).toBeGreaterThan(0);

    // And the add-on's own row is all of them added up — one add-on, every AI
    // feature's spend inside it. The row count is not fixed at two on purpose:
    // answering a question against a filled Knowledge folder embeds the question
    // as well, which is billed as vectorization of its own.
    const rows = await getServiceOperations(ownerApi.payment, "aiTools");
    const descriptions = rows.map((row) => row.description);
    expect(descriptions).toContain("Chat");
    expect(descriptions).toContain("Vectorization");

    const usage = await getServiceUsage(ownerApi.payment, "aiTools");
    expect(usage?.title).toBe("AI features");
    expect(usage?.operationCount).toBe(rows.length);
    expect(usage?.totalQuantity).toBe(
      rows.reduce((sum, row) => sum + (row.quantity ?? 0), 0),
    );
    expect(usage?.totalAmount).toBeCloseTo(
      rows.reduce((sum, row) => sum + (row.debit ?? 0), 0),
      6,
    );
  });

  // `agentId`/`agentTitle` are the wallet report's Source column, and an empty
  // Source is legitimate for *some* chat spend: the AI Chat opened from the
  // portal header is not in any agent, so its charge has nothing to name — that
  // is the test below this one. What this test is about is the other kind of
  // chat, the one sent with `entityId` set to an agent, which has to be
  // attributable to it the way vectorization already is.
  //
  // Two controls keep this meaningful: vectorization in the same agent carries
  // both fields, and — the stronger one — the embedding of the very question
  // this chat asked carries them too. BUG 83257 (fixed) was the Chat billing
  // row dropping the agent scope that the same request's own embedding kept.
  test("GET /api/2.0/portal/payment/customer/operations - a chat inside an agent names the agent the tokens were spent in", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const agentTitle = "Autotest Attributed Agent";
    const { agentId, knowledgeFolderId } = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      agentTitle,
    );

    const beforeIndexing = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );
    await uploadKnowledgeText(apiSdk, knowledgeFolderId, "attributed.txt");
    const indexing = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      beforeIndexing,
      isVectorizationCharge,
    );

    // The control: per-agent attribution works, and it works in this agent.
    expect(indexing?.description).toBe("Vectorization");
    expect(indexing?.agentId).toBe(String(agentId));
    expect(indexing?.agentTitle).toBe(agentTitle);

    const beforeChat = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );
    const profileId = await aiChat.defaultProfileId("owner");
    await spendOnAiTools(aiChat, "owner", {
      agentId,
      profileId,
      threadTitle: "Attributed chat",
    });

    const charged = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      beforeChat,
      isChatCharge,
    );
    // The premise, asserted before the failing part: the chat really was
    // billed. Otherwise "no agent on the charge" would also be true of a
    // portal that billed nothing at all.
    expect(charged, "the chat must be billed at all").toBeDefined();
    expect(charged?.description).toBe("Chat");

    // The second control, and the one that settles *why* this is a defect:
    // answering against a filled Knowledge folder also embeds the question, and
    // that charge — produced by this very send — does name the agent. So the
    // request knew its scope; only the Chat row lost it.
    //
    // Guarded rather than asserted outright: embedding the question is the
    // engine's own retrieval step, not something the test asks for, so its
    // absence must not decide the outcome of a test that is about the chat row.
    const questionEmbedding = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      beforeChat,
      isVectorizationCharge,
      30000,
    );
    if (questionEmbedding) {
      expect(
        questionEmbedding.agentId,
        "the embedding of the question this chat asked names the agent",
      ).toBe(String(agentId));
    }

    // The half that used to fail: the same two fields, the same agent, a
    // different feature.
    expect(charged?.agentId).toBe(String(agentId));
    expect(charged?.agentTitle).toBe(agentTitle);
  });

  test("GET /api/2.0/portal/payment/customer/operations - a chat outside any agent is billed with no Source", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const agentTitle = "Autotest Unsourced Agent";
    const { agentId, knowledgeFolderId } = await createAgentWithKnowledgeFolder(
      apiSdk,
      "owner",
      agentTitle,
    );

    // The positive control the absence check needs. "No agent on the row" is also
    // what a report that never fills these fields looks like, so the same portal
    // has to produce a row that does name an agent first — otherwise this test
    // would pass on a Billing page whose Source column is always blank.
    const beforeIndexing = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );
    await uploadKnowledgeText(apiSdk, knowledgeFolderId, "unsourced.txt");
    const indexing = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      beforeIndexing,
      isVectorizationCharge,
    );
    expect(indexing?.agentId, "the control charge must name its agent").toBe(
      String(agentId),
    );
    expect(indexing?.agentTitle).toBe(agentTitle);

    const beforeChat = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );

    // The AI Chat opened from the portal's own header: no `entityId` on either
    // call, so the tokens are spent in no agent at all. `spendOnAiTools` is not
    // used here on purpose — it always scopes to an agent, which is the whole
    // difference under test.
    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Chat with no agent",
      profileId,
    });
    await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      message: BILLED_QUESTION,
      timeoutMs: 240000,
    });
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    const charged = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      beforeChat,
      isChatCharge,
    );
    expect(charged, "the header chat must be billed too").toBeDefined();
    expect(charged?.debit).toBeGreaterThan(0);

    // Billed to whoever chatted, attributed to nothing else: this is the "—" the
    // wallet report shows in Source, and for this chat it is the right answer, not
    // the missing attribution the test above it is about.
    expect(charged?.agentId).toBeUndefined();
    expect(charged?.agentTitle).toBeUndefined();
  });

  test("GET /api/2.0/portal/payment/customer/operations - AI spend is filtered by service, participant and period", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const ownerId = await aiChat.whoAmI("owner");

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Shared Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // A member spends, the owner reads the billing back: the per-user breakdown
    // is only worth anything if the charge carries whoever burned the tokens,
    // not whoever owns the portal.
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;
    await inviteToAgent(ownerApi.rooms, agentId, memberId);
    await aiChat.expectActingAs("roomAdmin", memberId, "RoomAdmin");

    const before = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );
    await spendOnAiTools(aiChat, "roomAdmin", {
      agentId,
      profileId,
      threadTitle: "Member chat",
    });

    const charged = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      before,
      isChatCharge,
    );
    expect(charged, "the member's chat must be billed").toBeDefined();
    expect(charged?.participantName).toBe(memberId);
    const chargeKey = operationKey(charged!);

    const window = accountingPeriod();

    await test.step("serviceName keeps the add-on's spend to itself", async () => {
      const { data, status } = await ownerApi.payment.getCustomerOperations({
        offset: 0,
        limit: 100,
        serviceName: [walletServiceNames.aiTools],
        credit: true,
        debit: true,
        ...window,
      });

      expect(status).toBe(200);
      const rows = data.response?.collection ?? [];
      expect(rows.map(operationKey)).toContain(chargeKey);
      for (const row of rows) {
        expect(row.service).toBe(walletServiceNames.aiTools);
      }
    });

    await test.step("participantName splits the spend per user", async () => {
      const { data, status } = await ownerApi.payment.getCustomerOperations({
        offset: 0,
        limit: 100,
        serviceName: [walletServiceNames.aiTools],
        participantName: memberId,
        credit: true,
        debit: true,
        ...window,
      });

      expect(status).toBe(200);
      const rows = data.response?.collection ?? [];
      expect(rows.map(operationKey)).toContain(chargeKey);
      for (const row of rows) {
        expect(row.participantName).toBe(memberId);
      }

      // The other half of the same claim: filtering by someone who did not spend
      // must not hand back this charge. The read above is the positive control
      // that the filter can return rows at all.
      const { data: ownerRows, status: ownerStatus } =
        await ownerApi.payment.getCustomerOperations({
          offset: 0,
          limit: 100,
          serviceName: [walletServiceNames.aiTools],
          participantName: ownerId,
          credit: true,
          debit: true,
          ...window,
        });

      expect(ownerStatus).toBe(200);
      expect(
        (ownerRows.response?.collection ?? []).map(operationKey),
      ).not.toContain(chargeKey);
    });

    await test.step("the period is respected", async () => {
      // A window that ended before the test started. The dashboard's date picker
      // is only meaningful if a charge outside the range is really left out.
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 31);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 29);

      const { data, status } = await ownerApi.payment.getCustomerOperations({
        offset: 0,
        limit: 100,
        serviceName: [walletServiceNames.aiTools],
        credit: true,
        debit: true,
        startDate: startDate.toISOString().slice(0, 19),
        endDate: endDate.toISOString().slice(0, 19),
      });

      expect(status).toBe(200);
      expect((data.response?.collection ?? []).map(operationKey)).not.toContain(
        chargeKey,
      );
    });
  });

  test("GET /api/2.0/portal/payment/customer/balance - the AI charge is taken off the wallet", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const balanceBefore = await getWalletBalance(ownerApi.payment);
    expect(
      balanceBefore,
      "the wallet must be funded before spending",
    ).toBeGreaterThan(0);

    const operationsBefore = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Wallet Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    await spendOnAiTools(aiChat, "owner", {
      agentId,
      profileId,
      threadTitle: "Wallet chat",
    });

    // The charge has to be on the books before the balance can be expected to
    // have moved — otherwise this races the accounting service and fails on a
    // portal that bills perfectly well.
    const charged = await waitForMatchingServiceOperation(
      ownerApi.payment,
      "aiTools",
      operationsBefore,
      isChatCharge,
    );
    const debit = charged?.debit ?? 0;
    expect(debit).toBeGreaterThan(0);

    // Not just "the balance went down": down by exactly what the charge says.
    // A wallet that drifts by some other amount would still pass a `lessThan`
    // check while showing the user a number the report cannot explain.
    await expect(async () => {
      expect(await getWalletBalance(ownerApi.payment)).toBeCloseTo(
        balanceBefore - debit,
        6,
      );
    }).toPass({ intervals: [2_000, 5_000, 5_000], timeout: 120_000 });
  });

  test("POST /api/2.0/portal/payment/servicestate - switching the AI Tools add-on off stops the spend", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(900000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Switch Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // The positive control for the absence check below: with the add-on paid for,
    // this very setup produces a charge, found by the very same polling.
    const paidBaseline = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );
    await spendOnAiTools(aiChat, "owner", {
      agentId,
      profileId,
      threadTitle: "Chat while paid",
    });
    expect(
      await waitForMatchingServiceOperation(
        ownerApi.payment,
        "aiTools",
        paidBaseline,
        isChatCharge,
      ),
      "the paid half must be billed, or the unpaid half proves nothing",
    ).toBeDefined();

    const { status: disableStatus } = await disableWalletService(
      ownerApi.payment,
      "aiTools",
    );
    expect(disableStatus).toBe(200);

    const offBaseline = new Set(
      (await getServiceOperations(ownerApi.payment, "aiTools")).map(
        operationKey,
      ),
    );

    // A new thread: `waitForAssistantReply` returns on the first assistant
    // message it sees, and the paid thread already has one.
    const threadId = await aiChat.createThreadId("owner", {
      title: "Chat while switched off",
      profileId,
      agentId,
    });
    await aiChat.sendMessage("owner", {
      threadId,
      agentId,
      profileId,
      message: BILLED_QUESTION,
      timeoutMs: 240000,
    });

    // Inference is refused asynchronously, as a stored reply — the send itself
    // still answers 200.
    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expect(AiAgentChat.assistantStatus(messages)?.error?.code).toBe("auth");

    expect(
      await waitForServiceOperation(
        ownerApi.payment,
        "aiTools",
        offBaseline,
        60000,
      ),
      "a refused inference must not be billed",
    ).toBeUndefined();
  });
});
