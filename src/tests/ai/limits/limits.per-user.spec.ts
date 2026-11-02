import { test, expect } from "./limits-fixtures";
import {
  ChatOutcome,
  SearchOutcome,
  aiCharges,
  chargeSum,
  chatOutcome,
  createCustom,
  createGlobal,
  deleteLimit,
  limitOfUser,
  provisionAiPortal,
  scopeName,
  searchOutcome,
  settledUsage,
  updateLimit,
  waitForCharges,
} from "@/src/helpers/service-limits";
import { twoTextProfiles } from "@/src/helpers/ai-agent-chat";

// Limits that apply to one user: the personal (Custom) limit and the Global one
// that stands in for every user who has none.
//
// What is true today (measured 2026-11-02): both are stored, listed, shown in the
// profile, and the user's spending is counted against them - but NEITHER STOPS
// ANYTHING. A user whose Custom or Global limit is $0 keeps chatting and
// searching, at the portal's expense, and `usage.amountAvailable` reads 0 while
// they do. Only the Total limit refuses (limits.enforcement.spec.ts). The same
// request, with the same user, is refused at once when a Total limit of $0 is in
// force, so it is the per-user check that is missing, not the refusal path.
//
// The blocking tests below state the documented behaviour ("Zero blocks the AI
// services completely", "a personal limit applies to its user instead of the one
// for every user") and are marked `test.fail` under one placeholder; the
// accounting tests at the end pass today and fence what the fix must not break.
// Every blocking test asserts the refusal FIRST, so what fails is the missing
// refusal and not a later, unrelated step.

const refused = (chat: ChatOutcome) => {
  expect(chat.kind, "the chat is refused by the user's limit").toBe("limit");
  expect(chat.errorMessage).toMatch(/^403 Service limit exceeded/);
};
const searchRefused = (search: SearchOutcome) => {
  expect(search.kind, "the search is refused by the user's limit").toBe(
    "limit",
  );
  expect(search.status).toBe(403);
  expect(search.errorType).toBe("payment_error");
};

test.describe("Per-user limits - they must refuse", () => {
  test.fail(
    "BUG XXXXX: a Global limit of zero refuses AI Agent chat and AI Search for a user who has no personal limit",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(480000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const user = await makeMember("User");
      await createGlobal(ai.payment, 0);

      const chat = await chatOutcome(user.chat, user.role, {
        profileId: ai.profile.id,
      });
      const search = await searchOutcome(user.webSearch, user.role);

      refused(chat);
      searchRefused(search);
      expect(
        await aiCharges(ai.payment, user.id),
        "nothing was billed",
      ).toEqual([]);
    },
  );

  test.fail(
    "BUG XXXXX: a Custom limit of zero refuses AI Agent chat and AI Search for its user",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(480000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const user = await makeMember("User");
      await createCustom(ai.payment, user.id, 0);

      const chat = await chatOutcome(user.chat, user.role, {
        profileId: ai.profile.id,
      });
      const search = await searchOutcome(user.webSearch, user.role);

      refused(chat);
      searchRefused(search);
      expect(
        await aiCharges(ai.payment, user.id),
        "nothing was billed",
      ).toEqual([]);
    },
  );

  test.fail(
    "BUG XXXXX: a Custom limit too small for the reservation refuses a chat, as a Total limit of the same size does",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(480000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const user = await makeMember("User");
      // $0.10 is under the ~$0.44 a chat reply reserves, which is what a Total
      // limit of $0.10 refuses on.
      await createCustom(ai.payment, user.id, 0.1);

      const chat = await chatOutcome(user.chat, user.role, {
        profileId: ai.profile.id,
      });

      refused(chat);
    },
  );

  test.fail(
    "BUG XXXXX: a Custom limit overrides the Global one in both directions",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(600000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const personal = await makeMember("User");
      const bystander = await makeMember("RoomAdmin");
      const global = await createGlobal(ai.payment, 0);
      const custom = await createCustom(ai.payment, personal.id, 5);
      const spend = (member: typeof personal) =>
        chatOutcome(member.chat, member.role, { profileId: ai.profile.id });

      // Global is closed, Custom is open: the personal limit wins for its user
      // and the Global one still shuts out everybody else.
      refused(await spend(bystander));
      expect((await spend(personal)).kind).toBe("replied");

      // And the other way round.
      await updateLimit(ai.payment, { id: global.id!, amountValue: 5 });
      await updateLimit(ai.payment, { id: custom.id!, amountValue: 0 });
      refused(await spend(personal));
      expect((await spend(bystander)).kind).toBe("replied");
    },
  );

  test.fail(
    "BUG XXXXX: one user's exhausted Custom limit refuses that user and leaves another user working",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(600000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const limited = await makeMember("User");
      const other = await makeMember("RoomAdmin");
      await createCustom(ai.payment, limited.id, 0);

      // The limited user first: without a refusal here the isolation below
      // proves nothing.
      refused(
        await chatOutcome(limited.chat, limited.role, {
          profileId: ai.profile.id,
        }),
      );
      searchRefused(await searchOutcome(limited.webSearch, limited.role));

      const fine = await chatOutcome(other.chat, other.role, {
        profileId: ai.profile.id,
      });
      expect(fine.kind, fine.errorMessage).toBe("replied");
      expect((await searchOutcome(other.webSearch, other.role)).kind).toBe(
        "results",
      );
      expect(await aiCharges(ai.payment, limited.id)).toEqual([]);
    },
  );

  test.fail(
    "BUG XXXXX: a refused user is let back in by raising the Custom limit or deleting it, and out again by lowering it",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(600000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const user = await makeMember("User");
      const custom = await createCustom(ai.payment, user.id, 0);
      const spend = () =>
        chatOutcome(user.chat, user.role, { profileId: ai.profile.id });

      refused(await spend());

      await updateLimit(ai.payment, { id: custom.id!, amountValue: 5 });
      expect((await spend()).kind).toBe("replied");

      await updateLimit(ai.payment, { id: custom.id!, amountValue: 0 });
      refused(await spend());

      await deleteLimit(ai.payment, custom.id!);
      expect((await spend()).kind).toBe("replied");
    },
  );

  test.fail(
    "BUG XXXXX: switching a Custom limit off stops restricting its user, switching it on restricts again",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(600000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const user = await makeMember("User");
      const custom = await createCustom(ai.payment, user.id, 0);
      const spend = () =>
        chatOutcome(user.chat, user.role, { profileId: ai.profile.id });

      refused(await spend());

      await updateLimit(ai.payment, { id: custom.id!, enabled: false });
      expect((await spend()).kind).toBe("replied");

      await updateLimit(ai.payment, { id: custom.id!, enabled: true });
      refused(await spend());
    },
  );

  test.fail(
    "BUG XXXXX: a user whose Custom limit has been used up is refused, also after a re-login, in a new chat, with another model",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(600000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const user = await makeMember("User");
      const [modelA, modelB] = twoTextProfiles(ai.profiles);
      const custom = await createCustom(ai.payment, user.id, 100);
      const first = await chatOutcome(user.chat, user.role, {
        profileId: modelA.id,
      });
      expect(first.kind).toBe("replied");
      await waitForCharges(ai.payment, user.id, 1);
      const spent = (await settledUsage(ai.payment, user.id, 1))
        .amountConsumed!;

      await updateLimit(ai.payment, {
        id: custom.id!,
        amountValue: Number(spent.toFixed(9)),
      });
      await user.relogin();

      refused(
        await chatOutcome(user.chat, user.role, { profileId: modelA.id }),
      );
      refused(
        await chatOutcome(user.chat, user.role, { profileId: modelB.id }),
      );
      searchRefused(await searchOutcome(user.webSearch, user.role));
      expect((await aiCharges(ai.payment, user.id)).length).toBe(1);
    },
  );

  test.fail(
    "BUG XXXXX: concurrent chats of one user are admitted only as far as the user's Custom limit covers",
    async ({ apiSdk, paymentsApi, makeMember }) => {
      test.setTimeout(600000);
      const ai = await provisionAiPortal(apiSdk, paymentsApi);
      const user = await makeMember("User");
      // About $0.44 is reserved per reply, so $1.10 holds two of them.
      await createCustom(ai.payment, user.id, 1.1);

      const outcomes = await Promise.all(
        Array.from({ length: 6 }, () =>
          chatOutcome(user.chat, user.role, { profileId: ai.profile.id }),
        ),
      );

      expect(outcomes.filter((o) => o.kind === "replied")).toHaveLength(2);
      expect(outcomes.filter((o) => o.kind === "limit")).toHaveLength(4);
    },
  );
});

test.describe("Per-user limits - the spending is counted per user", () => {
  test("a user's spend is counted against their own Custom limit and nobody else's", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const mine = await makeMember("User");
    const other = await makeMember("RoomAdmin");
    await createCustom(ai.payment, mine.id, 100);
    await createCustom(ai.payment, other.id, 100);

    for (const member of [mine, other]) {
      const chat = await chatOutcome(member.chat, member.role, {
        profileId: ai.profile.id,
      });
      expect(chat.kind, chat.errorMessage).toBe("replied");
    }
    const search = await searchOutcome(mine.webSearch, mine.role);
    expect(search.kind).toBe("results");

    const myCharges = await waitForCharges(ai.payment, mine.id, 2);
    const otherCharges = await waitForCharges(ai.payment, other.id, 1);
    const myUsage = await settledUsage(ai.payment, mine.id, 2);
    const otherUsage = await settledUsage(ai.payment, other.id, 1);

    expect(myUsage.amountConsumed).toBeCloseTo(chargeSum(myCharges), 9);
    expect(otherUsage.amountConsumed).toBeCloseTo(chargeSum(otherCharges), 9);
    expect(myUsage.amountAvailable).toBeCloseTo(
      100 - myUsage.amountConsumed!,
      9,
    );
  });

  test("the Global limit's spending is counted per user, each against the same ceiling", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const first = await makeMember("User");
    const second = await makeMember("RoomAdmin");
    const global = await createGlobal(ai.payment, 100);

    for (const member of [first, second]) {
      const chat = await chatOutcome(member.chat, member.role, {
        profileId: ai.profile.id,
      });
      expect(chat.kind, chat.errorMessage).toBe("replied");
      await waitForCharges(ai.payment, member.id, 1);
    }

    for (const member of [first, second]) {
      const usage = await settledUsage(ai.payment, member.id, 1);
      const row = await limitOfUser(ai.payment, member.id);
      expect(scopeName(row)).toBe("Global");
      expect(row?.id).toBe(global.id);
      expect(usage.amountConsumed).toBeCloseTo(
        chargeSum(await aiCharges(ai.payment, member.id)),
        9,
      );
      expect(usage.amountAvailable).toBeCloseTo(100 - usage.amountConsumed!, 9);
    }
  });

  test("a switched-off Global limit drops out of the list once the users have spent", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    test.setTimeout(480000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const user = await makeMember("User");
    const global = await createGlobal(ai.payment, 100);
    const chat = await chatOutcome(user.chat, user.role, {
      profileId: ai.profile.id,
    });
    expect(chat.kind).toBe("replied");
    await waitForCharges(ai.payment, user.id, 1);
    await settledUsage(ai.payment, user.id, 1);
    expect(scopeName(await limitOfUser(ai.payment, user.id))).toBe("Global");

    await updateLimit(ai.payment, { id: global.id!, enabled: false });

    expect(await limitOfUser(ai.payment, user.id)).toBeUndefined();
  });
});
