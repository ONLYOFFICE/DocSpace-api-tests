import { test, expect } from "./limits-fixtures";
import {
  AiPortal,
  ChatOutcome,
  SearchOutcome,
  aiCharges,
  chargeSum,
  chatOutcome,
  createCustom,
  createTotal,
  deleteLimit,
  pollUntil,
  provisionAiPortal,
  readTotal,
  searchOutcome,
  settledUsage,
  updateLimit,
  waitForCharges,
} from "@/src/helpers/service-limits";
import { getWalletBalance } from "@/src/helpers/wallet-services";
import { AiAgentChat, twoTextProfiles } from "@/src/helpers/ai-agent-chat";
import { AiWebSearch } from "@/src/helpers/ai-web-search";
import { ApiSDK } from "@/src/services/api-sdk";

// The limit meeting real AI calls: AI Agents & Tools (chat) and AI Search, which
// share one budget (`ai-services`).
//
// Measured contract, 2026-11-02:
//
//   refusal, chat    HTTP 200 stream; the assistant message is stored as
//                    incomplete with error {code:"auth", message:"403 Service
//                    limit exceeded: ... Service group 'ai-services', amount limit
//                    <L>, available <A> until <periodEnd>"}
//   refusal, search  HTTP 403 {error:{type:"payment_error", code:"payment_error",
//                    message:"Service limit exceeded: ..."}}
//   admission        a call is let through only when `available` covers the cost
//                    the portal RESERVES for it up front - about $0.44 for a chat
//                    reply, about $0.008 for a search - not merely when `available`
//                    is above zero. A limit of $0.0001 therefore refuses the very
//                    first call, and that reservation is also why `available` dips
//                    while a reply is being written.
//   settling         the real cost is booked a few seconds after the reply; until
//                    then the reservation is still held. Every read of spend polls.
//   enforced scopes  Total only. Global and Custom limits are stored and shown but
//                    do not stop anything - see the "per-user limits" block.
//
// Money: chats cost between ~$0.003 (the provider's cache is warm) and ~$0.06 (it
// is cold), a search ~$0.008. Nothing here depends on those figures; thresholds
// are set relative to what was actually billed in the same test.

const LONG_PROMPT = "Write about 250 words on what spreadsheets are used for.";

async function selfId(api: ReturnType<ApiSDK["forRole"]>) {
  return (await api.profiles.getSelfProfile()).data.response!.id!;
}

function expectChatRefused(outcome: ChatOutcome, amountLimit?: string) {
  expect(outcome.kind, outcome.errorMessage).toBe("limit");
  expect(outcome.errorCode).toBe("auth");
  expect(outcome.errorMessage).toMatch(/^403 Service limit exceeded/);
  expect(outcome.errorMessage).toContain("Service group 'ai-services'");
  if (amountLimit) {
    expect(outcome.errorMessage).toContain(`amount limit ${amountLimit}`);
  }
}

function expectSearchRefused(outcome: SearchOutcome) {
  expect(outcome.kind, outcome.errorMessage).toBe("limit");
  expect(outcome.status).toBe(403);
  expect(outcome.errorType).toBe("payment_error");
  expect(outcome.errorMessage).toMatch(/^Service limit exceeded/);
  expect(outcome.errorMessage).toContain("Service group 'ai-services'");
}

/**
 * Proves the refusals before this call billed nothing: the ceiling is raised,
 * one control chat is spent, and that control must be the participant's only
 * charge. Billing is written in the order calls finish, so a refused call that
 * had been billed would be on the list by the time the control is.
 */
async function expectOnlyControlCharge(
  ai: AiPortal,
  totalId: number,
  participantId: string,
  spend: () => Promise<ChatOutcome>,
) {
  await updateLimit(ai.payment, { id: totalId, amountValue: 100 });
  const control = await spend();
  expect(control.kind, `the control chat: ${control.errorMessage}`).toBe(
    "replied",
  );
  const charges = await waitForCharges(ai.payment, participantId, 1);
  expect(
    charges,
    "the control chat is the only AI charge: the refused calls billed nothing",
  ).toHaveLength(1);
}

/**
 * The money the portal holds back for a chat reply while it is being written,
 * read off the limit: what is left under the ceiling minus what `available`
 * says. Needs a ceiling far above the spending, so that the gap is the
 * reservation and nothing else.
 */
async function measureChatReserve(ai: AiPortal): Promise<number> {
  let reserve = 0;
  let finished = false;
  const run = chatOutcome(ai.ownerChat, "owner", {
    profileId: ai.profile.id,
    message: LONG_PROMPT,
  }).then((outcome) => {
    finished = true;
    return outcome;
  });
  const deadline = Date.now() + 60000;
  while (reserve === 0 && Date.now() < deadline) {
    const total = (await readTotal(ai.payment))!;
    const usage = total.usage!;
    reserve = Math.max(
      reserve,
      total.amountValue! - usage.amountConsumed! - usage.amountAvailable!,
    );
    if (finished && reserve === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  expect((await run).kind).toBe("replied");
  expect(reserve, "a reservation was observed").toBeGreaterThan(0);
  return reserve;
}

test.describe("Total limit - spending within the budget", () => {
  test("an agent chat and an AI search both draw on the one Total budget, and amountConsumed equals what billing booked", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const owner = apiSdk.forRole("owner");
    const ownerId = await selfId(owner);
    const search = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    await createTotal(ai.payment, 5);
    const balanceBefore = await getWalletBalance(ai.payment);
    const agentId = await ai.ownerChat.createAgentId("owner", {
      title: "Limits agent",
      profileId: ai.profile.id,
      prompt: "Answer in one short sentence.",
    });

    await test.step("an AI Agent answers while the budget is available", async () => {
      const chat = await chatOutcome(ai.ownerChat, "owner", {
        profileId: ai.profile.id,
        agentId,
      });
      expect(chat.kind, chat.errorMessage).toBe("replied");
    });

    const afterChat =
      await test.step("the chat's cost is booked and shows as consumed", async () => {
        const charges = await waitForCharges(ai.payment, ownerId, 1);
        const usage = await settledUsage(ai.payment, undefined, 1);
        expect(usage.amountConsumed).toBeGreaterThan(0);
        expect(usage.amountConsumed).toBeCloseTo(chargeSum(charges), 9);
        expect(usage.amountAvailable).toBeCloseTo(5 - usage.amountConsumed!, 9);
        return usage.amountConsumed!;
      });

    await test.step("AI Search works too, and its cost lands in the same counter", async () => {
      const found = await searchOutcome(search, "owner");
      expect(found.kind, found.errorMessage).toBe("results");

      const charges = await waitForCharges(ai.payment, ownerId, 2);
      const usage = await settledUsage(ai.payment, undefined, 2);
      const searchCharge = charges.find((row) => row.description !== "Chat");
      expect(searchCharge, "a search charge was booked").toBeDefined();
      expect(searchCharge?.service).toBe("ai-search");
      expect(usage.amountConsumed).toBeCloseTo(
        afterChat + searchCharge!.debit!,
        9,
      );
      expect(usage.amountConsumed).toBeCloseTo(chargeSum(charges), 9);
    });

    await test.step("the wallet was debited by the same amount", async () => {
      const spent = (await readTotal(ai.payment))!.usage!.amountConsumed!;
      const balanceAfter = await getWalletBalance(ai.payment);
      expect(balanceBefore - balanceAfter).toBeCloseTo(spent, 6);
    });
  });

  test("every user's spending counts towards the one Total budget", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const user = await makeMember("User");
    const ownerId = await selfId(apiSdk.forRole("owner"));
    await createTotal(ai.payment, 5);

    const byOwner = await chatOutcome(ai.ownerChat, "owner", {
      profileId: ai.profile.id,
    });
    const byUser = await chatOutcome(user.chat, user.role, {
      profileId: ai.profile.id,
    });
    expect(byOwner.kind, byOwner.errorMessage).toBe("replied");
    expect(byUser.kind, byUser.errorMessage).toBe("replied");

    const ownerCharges = await waitForCharges(ai.payment, ownerId, 1);
    const userCharges = await waitForCharges(ai.payment, user.id, 1);
    const usage = await settledUsage(ai.payment, undefined, 2);
    expect(usage.amountConsumed).toBeCloseTo(
      chargeSum(ownerCharges) + chargeSum(userCharges),
      9,
    );
  });
});

test.describe("Total limit - refusals", () => {
  test("a Total limit of zero refuses an AI Agent chat, and the refused chat is not billed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    const total = await createTotal(ai.payment, 0);
    const agentId = await ai.ownerChat.createAgentId("owner", {
      title: "Limits agent",
      profileId: ai.profile.id,
      prompt: "Answer in one short sentence.",
    });

    const refused = await chatOutcome(ai.ownerChat, "owner", {
      profileId: ai.profile.id,
      agentId,
    });
    expectChatRefused(refused, "0.0000000000");
    expect(refused.errorMessage).toContain("available 0.0000000000");
    expect((await readTotal(ai.payment))?.usage?.amountConsumed).toBe(0);

    // The stored thread holds the user's message and the refused reply, nothing else.
    const messages = await ai.ownerChat.readMessages("owner", refused.threadId);
    expect(AiAgentChat.userMessages(messages.data ?? [])).toHaveLength(1);
    expect(
      AiAgentChat.messageText(
        AiAgentChat.assistantMessages(messages.data ?? [])[0],
      ),
    ).toBe("");

    await expectOnlyControlCharge(ai, total.id!, ownerId, () =>
      chatOutcome(ai.ownerChat, "owner", {
        profileId: ai.profile.id,
        agentId,
      }),
    );
  });

  test("a Total limit of zero refuses AI Search with 403 payment_error, and the refused search is not billed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    const search = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const total = await createTotal(ai.payment, 0);

    expectSearchRefused(await searchOutcome(search, "owner"));
    expect((await readTotal(ai.payment))?.usage?.amountConsumed).toBe(0);

    // Resumes once the ceiling is raised - and the search that resumes is billed.
    await updateLimit(ai.payment, { id: total.id!, amountValue: 100 });
    const resumed = await searchOutcome(search, "owner");
    expect(resumed.kind, resumed.errorMessage).toBe("results");
    const charges = await waitForCharges(ai.payment, ownerId, 1);
    expect(
      charges,
      "only the search that was let through is billed",
    ).toHaveLength(1);
    expect(charges[0].service).toBe("ai-search");
  });

  test("a Total limit of zero refuses both services for every kind of user", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    await createTotal(ai.payment, 0);
    const members = [
      await makeMember("DocSpaceAdmin"),
      await makeMember("RoomAdmin"),
      await makeMember("User"),
    ];

    for (const member of members) {
      const chat = await chatOutcome(member.chat, member.role, {
        profileId: ai.profile.id,
      });
      expectChatRefused(chat, "0.0000000000");
      expectSearchRefused(await searchOutcome(member.webSearch, member.role));
    }
    expect((await readTotal(ai.payment))?.usage?.amountConsumed).toBe(0);
  });

  test("the Total limit still refuses when a user's own Custom limit is far above it", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const user = await makeMember("User");
    await createCustom(ai.payment, user.id, 1000);
    await createTotal(ai.payment, 0);

    // The portal's limit is checked on top of the user's own, so room under the
    // personal ceiling does not help.
    const chat = await chatOutcome(user.chat, user.role, {
      profileId: ai.profile.id,
    });
    expectChatRefused(chat);
    expectSearchRefused(await searchOutcome(user.webSearch, user.role));
  });

  test("raising the Total limit lets the refused user back in", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const user = await makeMember("User");
    const total = await createTotal(ai.payment, 0);
    const spend = () =>
      chatOutcome(user.chat, user.role, { profileId: ai.profile.id });
    expectChatRefused(await spend());

    await updateLimit(ai.payment, { id: total.id!, amountValue: 5 });

    expect((await spend()).kind).toBe("replied");
    expect((await searchOutcome(user.webSearch, user.role)).kind).toBe(
      "results",
    );
  });

  test("deleting the Total limit lets both services through again", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const search = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const total = await createTotal(ai.payment, 0);
    expectChatRefused(
      await chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id }),
    );
    expectSearchRefused(await searchOutcome(search, "owner"));

    await deleteLimit(ai.payment, total.id!);

    expect(
      (await chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id }))
        .kind,
    ).toBe("replied");
    expect((await searchOutcome(search, "owner")).kind).toBe("results");
  });

  test("a switched-off Total limit stops restricting, and switching it back on restricts again", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const search = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const total = await createTotal(ai.payment, 0);
    expectSearchRefused(await searchOutcome(search, "owner"));

    await updateLimit(ai.payment, { id: total.id!, enabled: false });
    expect((await readTotal(ai.payment))?.enabled).toBe(false);
    expect((await searchOutcome(search, "owner")).kind).toBe("results");
    expect(
      (await chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id }))
        .kind,
    ).toBe("replied");

    await updateLimit(ai.payment, { id: total.id!, enabled: true });
    expectSearchRefused(await searchOutcome(search, "owner"));
    expectChatRefused(
      await chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id }),
    );
  });

  test("the refusal does not depend on re-login, a new chat, another agent or another model", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const user = await makeMember("User");
    await createTotal(ai.payment, 0);
    const [modelA, modelB] = twoTextProfiles(ai.profiles);

    const first = await chatOutcome(user.chat, user.role, {
      profileId: modelA.id,
    });
    expectChatRefused(first);

    await user.relogin();
    expectChatRefused(
      await chatOutcome(user.chat, user.role, { profileId: modelA.id }),
    );
    expectSearchRefused(await searchOutcome(user.webSearch, user.role));

    // The same thread, continued.
    expectChatRefused(
      await chatOutcome(user.chat, user.role, {
        profileId: modelA.id,
        threadId: first.threadId,
      }),
    );

    // A different model.
    expectChatRefused(
      await chatOutcome(user.chat, user.role, { profileId: modelB.id }),
    );

    // A different agent, one the user has been invited to.
    const agentId = await ai.ownerChat.createAgentId("owner", {
      title: "Second agent",
      profileId: modelB.id,
      prompt: "Answer briefly.",
    });
    const { inviteToAgent } = await import("@/src/helpers/ai-agent-chat");
    await inviteToAgent(apiSdk.forRole("owner").rooms, agentId, user.id);
    expectChatRefused(
      await chatOutcome(user.chat, user.role, {
        profileId: modelB.id,
        agentId,
      }),
    );
    expect((await readTotal(ai.payment))?.usage?.amountConsumed).toBe(0);
  });
});

test.describe("Total limit - boundaries and the reservation", () => {
  test("a chat reply holds a reservation while it is written, and gives it back once billed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    await createTotal(ai.payment, 100);

    const reserve = await measureChatReserve(ai);
    expect(reserve).toBeGreaterThan(0.1);
    expect(reserve).toBeLessThan(2);

    await waitForCharges(ai.payment, ownerId, 1);
    const usage = await settledUsage(ai.payment, undefined, 1);
    expect(usage.amountConsumed).toBeGreaterThan(0);
    // Gone once the real cost is booked: what is available is what is left.
    expect(usage.amountAvailable).toBeCloseTo(100 - usage.amountConsumed!, 9);
  });

  test("the limit is checked against the reservation: zero, the spent amount, and just above it refuse; room for the reservation lets a chat through", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    const total = await createTotal(ai.payment, 100);
    const reserve = await measureChatReserve(ai);
    await waitForCharges(ai.payment, ownerId, 1);
    const spent = (await settledUsage(ai.payment, undefined, 1))
      .amountConsumed!;
    const spend = () =>
      chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id });

    const refusals: Array<[string, number]> = [
      ["zero", 0],
      ["a hair below the spent amount", Math.max(0, spent - 0.0001)],
      ["exactly the spent amount", spent],
      ["a hair above the spent amount", spent + 0.0001],
      ["short of the reservation", spent + reserve - 0.05],
    ];
    for (const [name, amount] of refusals) {
      await updateLimit(ai.payment, {
        id: total.id!,
        amountValue: Number(amount.toFixed(9)),
      });
      expect((await readTotal(ai.payment))?.amountValue).toBeCloseTo(amount, 9);
      expectChatRefused(await spend());
      expect(name).toBeDefined();
    }
    // Refusals billed nothing.
    expect((await aiCharges(ai.payment, ownerId)).length).toBe(1);

    await updateLimit(ai.payment, {
      id: total.id!,
      amountValue: Number((spent + reserve + 0.05).toFixed(9)),
    });
    expect((await spend()).kind).toBe("replied");
    await waitForCharges(ai.payment, ownerId, 2);
  });

  test("AI Search is checked against its own, much smaller, reservation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    const search = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const total = await createTotal(ai.payment, 0.001);

    expectSearchRefused(await searchOutcome(search, "owner"));
    // A search costs under a cent, so a few cents is room for it - and not for a chat.
    await updateLimit(ai.payment, { id: total.id!, amountValue: 0.05 });
    expectChatRefused(
      await chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id }),
    );
    const found = await searchOutcome(search, "owner");
    expect(found.kind, found.errorMessage).toBe("results");

    const charges = await waitForCharges(ai.payment, ownerId, 1);
    expect(charges).toHaveLength(1);
    expect(charges[0].debit).toBeGreaterThan(0);
    expect(charges[0].debit).toBeLessThan(0.05);
  });

  test("an exhausted Total limit refuses both services after the spending has been booked", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    const search = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    const total = await createTotal(ai.payment, 100);
    expect(
      (await chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id }))
        .kind,
    ).toBe("replied");
    await waitForCharges(ai.payment, ownerId, 1);
    const spent = (await settledUsage(ai.payment, undefined, 1))
      .amountConsumed!;

    // The ceiling is now the amount already spent: nothing is left.
    await updateLimit(ai.payment, {
      id: total.id!,
      amountValue: Number(spent.toFixed(9)),
    });

    const usage = (await readTotal(ai.payment))!.usage!;
    expect(usage.amountAvailable).toBe(0);
    expectChatRefused(
      await chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id }),
    );
    expectSearchRefused(await searchOutcome(search, "owner"));
    expect((await aiCharges(ai.payment, ownerId)).length).toBe(1);
  });

  test("concurrent chats are admitted only as far as the budget covers: the reservations are taken atomically", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    const total = await createTotal(ai.payment, 100);
    const reserve = await measureChatReserve(ai);
    await waitForCharges(ai.payment, ownerId, 1);
    const before = await settledUsage(ai.payment, undefined, 1);

    // Room for two reservations and a bit over, not for three.
    const ceiling = before.amountConsumed! + 2.5 * reserve;
    await updateLimit(ai.payment, {
      id: total.id!,
      amountValue: Number(ceiling.toFixed(9)),
    });
    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () =>
        chatOutcome(ai.ownerChat, "owner", { profileId: ai.profile.id }),
      ),
    );

    const replied = outcomes.filter((outcome) => outcome.kind === "replied");
    const refused = outcomes.filter((outcome) => outcome.kind === "limit");
    expect(replied.length + refused.length, "no other kind of failure").toBe(6);
    expect(replied, JSON.stringify(outcomes.map((o) => o.kind))).toHaveLength(
      2,
    );
    for (const outcome of refused) expectChatRefused(outcome);

    // The two that ran are billed, the four refused are not, and the budget
    // is never over-committed.
    await waitForCharges(ai.payment, ownerId, 3);
    const after = await settledUsage(ai.payment, undefined, 3);
    expect((await aiCharges(ai.payment, ownerId)).length).toBe(3);
    expect(after.amountConsumed).toBeLessThanOrEqual(ceiling);
    expect(after.amountAvailable).toBeCloseTo(
      ceiling - after.amountConsumed!,
      9,
    );
  });

  test("concurrent AI Search calls are admitted only as far as the budget covers", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    const search = new AiWebSearch(apiSdk.request, apiSdk.tokenStore);
    // One search is booked at under a cent; a ceiling of two cents holds one
    // reservation of ~0.008 twice over at most.
    await createTotal(ai.payment, 0.02);

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => searchOutcome(search, "owner")),
    );

    const served = outcomes.filter((outcome) => outcome.kind === "results");
    const refused = outcomes.filter((outcome) => outcome.kind === "limit");
    expect(served.length + refused.length, "no other kind of failure").toBe(5);
    expect(served.length).toBeGreaterThanOrEqual(1);
    expect(served.length).toBeLessThan(5);
    for (const outcome of refused) expectSearchRefused(outcome);

    const charges = await waitForCharges(ai.payment, ownerId, served.length);
    expect(charges).toHaveLength(served.length);
    expect(chargeSum(charges)).toBeLessThanOrEqual(0.02);
  });

  test("a chat cut off mid-reply gives its reservation back and is billed for what it used", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    await createTotal(ai.payment, 100);
    const agentId = await ai.ownerChat.createAgentId("owner", {
      title: "Cut-off agent",
      profileId: ai.profile.id,
      prompt: "Write long, detailed answers.",
    });
    const threadId = await ai.ownerChat.createThreadId("owner", {
      title: "cut off",
      profileId: ai.profile.id,
      agentId,
    });

    const { aborted } = await ai.ownerChat.sendAndAbort("owner", {
      threadId,
      agentId,
      profileId: ai.profile.id,
      message: "Write about 600 words on what spreadsheets are used for.",
      afterMs: 1500,
    });
    expect(aborted, "the request really was cut off").toBe(true);

    // `settledUsage` only returns once no reservation is left hanging: spend
    // equals what was billed and available is the ceiling less that.
    await waitForCharges(ai.payment, ownerId, 1);
    const usage = await settledUsage(ai.payment, undefined, 1);
    expect(usage.amountConsumed).toBeGreaterThan(0);
    expect(usage.amountAvailable).toBeCloseTo(100 - usage.amountConsumed!, 9);
  });

  test("a chat that fails before any model is called reserves and bills nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const ownerId = await selfId(apiSdk.forRole("owner"));
    await createTotal(ai.payment, 100);
    const threadId = await ai.ownerChat.createThreadId("owner", {
      title: "bad model",
      profileId: ai.profile.id,
    });

    const sent = await ai.ownerChat.sendMessage("owner", {
      threadId,
      profileId: "does-not-exist",
      message: "hello",
      timeoutMs: 60000,
    });

    expect(sent.status).toBe(400);
    const usage = (await readTotal(ai.payment))!.usage!;
    expect(usage.amountConsumed).toBe(0);
    expect(usage.amountAvailable, "nothing was held back").toBe(100);
    // Positive control: the portal still serves, and only that one is billed.
    const next = await chatOutcome(ai.ownerChat, "owner", {
      profileId: ai.profile.id,
    });
    expect(next.kind).toBe("replied");
    expect(await waitForCharges(ai.payment, ownerId, 1)).toHaveLength(1);
    await pollUntil(
      async () => (await readTotal(ai.payment))!.usage!,
      (u) => u.amountConsumed! > 0 && u.amountAvailable! > 99,
    );
  });
});
