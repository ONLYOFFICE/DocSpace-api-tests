import { test, expect } from "./limits-fixtures";
import {
  aiCharges,
  chatOutcome,
  createCustom,
  provisionAiPortal,
  readLimit,
  searchOutcome,
  settledUsage,
  updateLimit,
  waitForCharges,
} from "@/src/helpers/service-limits";

// AI-LIMITS-001 - a user went on making paid AI requests with a personal limit of
// $1.01 per day and $1.38 already spent that day.
//
// The state that production run was in is "spent more than the limit allows":
// the limit says one thing and the user's counter says another. This test builds
// exactly that state in the way the JSDoc spells out ("lowering it below what was
// already spent blocks the AI services until the period ends") and then does what
// the user did - signs in again and asks for more:
//
//   1. a Custom limit is created for the user, with room to spare
//   2. the user spends for real: a chat and a search
//   3. the Custom limit is lowered below what the user has spent
//   4. the stored limit is read back, and so is the user's counter
//   5. the user signs in again
//   6. a new AI Chat request, and 7. an AI Search
//   8. both must be refused and neither may create a paid operation
//
// It reproduces: both calls are served and billed (2026-11-02, every run so far),
// the user's `amountAvailable` stays at 0 throughout. Marked
// `test.fail` with the issue id; it fails on step 6, the first refusal that does
// not come, and the later steps are not reached.
test.fail(
  "AI-LIMITS-001 BUG 84836: a user whose Custom limit has been lowered below what they spent is refused AI Chat and AI Search after signing in again",
  async ({ apiSdk, paymentsApi, makeMember }) => {
    test.setTimeout(600000);
    const ai = await provisionAiPortal(apiSdk, paymentsApi);
    const user = await makeMember("User");

    const custom = await createCustom(ai.payment, user.id, 1.01);

    await test.step("the user spends under the limit", async () => {
      const chat = await chatOutcome(user.chat, user.role, {
        profileId: ai.profile.id,
      });
      expect(chat.kind, chat.errorMessage).toBe("replied");
      const search = await searchOutcome(user.webSearch, user.role);
      expect(search.kind, search.errorMessage).toBe("results");
      await waitForCharges(ai.payment, user.id, 2);
    });
    const spent = (await settledUsage(ai.payment, user.id, 2)).amountConsumed!;
    expect(spent).toBeGreaterThan(0);

    await test.step("the limit is lowered below what was spent, and read back", async () => {
      const lowered = Number((spent / 2).toFixed(9));
      await updateLimit(ai.payment, { id: custom.id!, amountValue: lowered });
      expect((await readLimit(ai.payment, custom.id!)).amountValue).toBe(
        lowered,
      );
      const usage = await settledUsage(ai.payment, user.id, 2);
      expect(usage.amountConsumed, "the counter is untouched").toBeCloseTo(
        spent,
        9,
      );
      expect(usage.amountAvailable, "nothing is left").toBe(0);
    });

    await user.relogin();
    const chargesBefore = (await aiCharges(ai.payment, user.id)).length;

    await test.step("a new chat is refused", async () => {
      const chat = await chatOutcome(user.chat, user.role, {
        profileId: ai.profile.id,
      });
      expect(chat.kind, "AI Chat after the limit was exceeded").toBe("limit");
      expect(chat.errorMessage).toMatch(/^403 Service limit exceeded/);
    });

    await test.step("AI Search is refused", async () => {
      const search = await searchOutcome(user.webSearch, user.role);
      expect(search.kind, "AI Search after the limit was exceeded").toBe(
        "limit",
      );
      expect(search.status).toBe(403);
    });

    await test.step("neither created a paid operation", async () => {
      // A control spend after the ceiling is lifted: it has to be the only
      // charge added, so a refused call that was billed would show up.
      await updateLimit(ai.payment, { id: custom.id!, amountValue: 100 });
      const control = await chatOutcome(user.chat, user.role, {
        profileId: ai.profile.id,
      });
      expect(control.kind).toBe("replied");
      const charges = await waitForCharges(
        ai.payment,
        user.id,
        chargesBefore + 1,
      );
      expect(charges).toHaveLength(chargesBefore + 1);
    });
  },
);
