import { test, expect } from "./limits-fixtures";
import {
  LimitPeriod,
  createCustom,
  createGlobal,
  createTotal,
  errorMessage,
  limitOfUser,
  listLimits,
  periodName,
  provisionBilling,
  readGlobal,
  readLimit,
  readTotal,
  scopeName,
  updateLimit,
} from "@/src/helpers/service-limits";
import {
  OperationOrderType,
  ServiceLimitOrderBy,
} from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";

// The per-user side of the limits: `participants` (list), `participants` (bulk
// set) and `participants/disable`. A Custom limit is the user's own; the Global
// one is the same ceiling for everybody else, listed once per user it applies to.

async function addUsers(apiSdk: ApiSDK, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index++) {
    const { data } = await apiSdk.addMember("owner", "User");
    ids.push(data.response!.id!);
  }
  return ids;
}

test.describe("POST /portal/payment/servicelimit/participants - bulk set", () => {
  test("sets the same personal limit for every listed user and returns how many", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const users = await addUsers(apiSdk, 3);

    const { status, data } = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: users,
        amountValue: 2.5,
        period: LimitPeriod.Week,
      },
    });
    expect(status).toBe(200);
    expect(data.response).toBe(3);

    for (const userId of users) {
      const limit = await limitOfUser(payment, userId);
      expect(scopeName(limit), userId).toBe("Custom");
      expect(limit?.amountValue).toBe(2.5);
      expect(periodName(limit)).toBe("Week");
      expect(limit?.enabled).toBe(true);
      expect(limit?.usage?.amountConsumed).toBe(0);
      expect(limit?.usage?.amountAvailable).toBe(2.5);
    }
    // Three users, three personal limits - not one shared row.
    expect((await listLimits(payment)).totalQuantity).toBe(3);
  });

  test("replaces a user's existing limit as a whole: new amount, new period, switched back on", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const [userId] = await addUsers(apiSdk, 1);
    const existing = await createCustom(payment, userId, 1, LimitPeriod.Day);
    await updateLimit(payment, { id: existing.id!, enabled: false });

    const { status } = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: [userId],
        amountValue: 9,
        period: LimitPeriod.Month,
      },
    });
    expect(status).toBe(200);

    const limit = await limitOfUser(payment, userId);
    expect(scopeName(limit)).toBe("Custom");
    expect(limit?.amountValue).toBe(9);
    // `PUT` cannot change a period; the bulk call sets the whole limit and can.
    expect(periodName(limit)).toBe("Month");
    expect(limit?.enabled).toBe(true);
    expect((await listLimits(payment)).totalQuantity).toBe(1);
  });

  test("is idempotent: the same call twice leaves the same limits", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const users = await addUsers(apiSdk, 2);
    const body = {
      setParticipantServiceLimitsRequestDto: {
        userIds: users,
        amountValue: 3,
        period: LimitPeriod.Day,
      },
    };

    const first = await payment.setParticipantServiceLimits(body);
    const afterFirst = await listLimits(payment);
    const second = await payment.setParticipantServiceLimits(body);
    const afterSecond = await listLimits(payment);

    expect(first.data.response).toBe(2);
    expect(second.data.response).toBe(2);
    expect(afterSecond.totalQuantity).toBe(2);
    const shape = (report: typeof afterFirst) =>
      (report.collection ?? [])
        .map((item) => [item.userId, item.amountValue, periodName(item)])
        .sort();
    expect(shape(afterSecond)).toEqual(shape(afterFirst));
  });

  test("a user listed twice is limited once", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const [userId] = await addUsers(apiSdk, 1);

    const { status, data } = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: [userId, userId, userId],
        amountValue: 1,
        period: LimitPeriod.Day,
      },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(1);
    expect((await listLimits(payment)).totalQuantity).toBe(1);
  });

  test("leaves the Total and Global limits and the limits of unlisted users alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const [listed, unlisted] = await addUsers(apiSdk, 2);
    const total = await createTotal(payment, 10);
    const global = await createGlobal(payment, 3);
    const theirs = await createCustom(payment, unlisted, 1);

    await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: [listed],
        amountValue: 5,
        period: LimitPeriod.Day,
      },
    });

    expect((await readTotal(payment))?.amountValue).toBe(10);
    expect((await readTotal(payment))?.id).toBe(total.id);
    expect((await readGlobal(payment))?.amountValue).toBe(3);
    expect((await readGlobal(payment))?.id).toBe(global.id);
    expect((await readLimit(payment, theirs.id!)).amountValue).toBe(1);
  });

  test("accepts an amount of zero and the 10000 maximum, and refuses above it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const [zero, max, over] = await addUsers(apiSdk, 3);
    const set = (userId: string, amountValue: number) =>
      payment.setParticipantServiceLimits({
        setParticipantServiceLimitsRequestDto: {
          userIds: [userId],
          amountValue,
          period: LimitPeriod.Day,
        },
      });

    expect((await set(zero, 0)).status).toBe(200);
    expect((await set(max, 10000)).status).toBe(200);
    const refused = await set(over, 10000.01);
    expect(refused.status).toBe(400);
    expect(errorMessage(refused.data)).toContain("AmountValue");

    expect((await limitOfUser(payment, zero))?.amountValue).toBe(0);
    expect((await limitOfUser(payment, max))?.amountValue).toBe(10000);
    expect(await limitOfUser(payment, over)).toBeUndefined();
  });
});

test.describe("POST /portal/payment/servicelimit/participants/disable", () => {
  test("switches off every personal limit, keeps them, and leaves Total and Global in force", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const users = await addUsers(apiSdk, 3);
    const total = await createTotal(payment, 10);
    const global = await createGlobal(payment, 3);
    const customs = [];
    for (const userId of users) {
      customs.push(await createCustom(payment, userId, 1));
    }

    const { status, data } = await payment.disableParticipantServiceLimits();
    expect(status).toBe(200);
    expect(data.response).toBe(3);

    for (const custom of customs) {
      const kept = await readLimit(payment, custom.id!);
      expect(kept.enabled, "switched off, not deleted").toBe(false);
      expect(kept.amountValue).toBe(1);
    }
    expect((await readTotal(payment))?.enabled).toBe(true);
    expect((await readGlobal(payment))?.enabled).toBe(true);
    expect((await readTotal(payment))?.id).toBe(total.id);
    expect((await readGlobal(payment))?.id).toBe(global.id);
    // Disabled limits are not listed: what a user falls back to is the Global one.
    for (const item of (await listLimits(payment)).collection ?? []) {
      expect(scopeName(item), `listed for ${item.userId}`).not.toBe("Custom");
    }
  });

  test("a switched-off personal limit can be switched back on, and is then listed again", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const [userId] = await addUsers(apiSdk, 1);
    const custom = await createCustom(payment, userId, 1);
    await payment.disableParticipantServiceLimits();
    expect(await limitOfUser(payment, userId)).toBeUndefined();

    await updateLimit(payment, { id: custom.id!, enabled: true });

    const limit = await limitOfUser(payment, userId);
    expect(limit?.id).toBe(custom.id);
    expect(scopeName(limit)).toBe("Custom");
    expect(limit?.enabled).toBe(true);
  });

  test("is idempotent: a repeat switches off nothing more, and with no limit at all it answers 0", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const empty = await payment.disableParticipantServiceLimits();
    expect(empty.status).toBe(200);
    expect(empty.data.response).toBe(0);

    const [userId] = await addUsers(apiSdk, 1);
    await createCustom(payment, userId, 1);
    expect(
      (await payment.disableParticipantServiceLimits()).data.response,
    ).toBe(1);
    const repeat = await payment.disableParticipantServiceLimits();
    expect(repeat.status).toBe(200);
    expect(repeat.data.response).toBe(0);
  });

  test("a personal limit that is already off is not counted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const [on, off] = await addUsers(apiSdk, 2);
    await createCustom(payment, on, 1);
    const stays = await createCustom(payment, off, 1);
    await updateLimit(payment, { id: stays.id!, enabled: false });

    const { data } = await payment.disableParticipantServiceLimits();

    expect(data.response).toBe(1);
  });
});

test.describe("GET /portal/payment/servicelimit/participants", () => {
  // A user who has never used the AI services "may be missing" from the list
  // (the JSDoc says so), so a Global limit is only listed for users who have
  // spent; what a user without a personal limit falls back to is checked through
  // their profile (limits.profile.spec.ts) and through real spending
  // (limits.enforcement.spec.ts).
  test("a user with a Custom limit is listed with it, whatever the Global limit says", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const [userId] = await addUsers(apiSdk, 1);
    await createGlobal(payment, 3);
    const custom = await createCustom(payment, userId, 1);

    const own = await limitOfUser(payment, userId);
    expect(scopeName(own)).toBe("Custom");
    expect(own?.id).toBe(custom.id);
    expect(own?.amountValue).toBe(1);
  });

  test("pages through the limits with offset and limit, and reports the totals", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const users = await addUsers(apiSdk, 5);
    await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: users,
        amountValue: 1,
        period: LimitPeriod.Day,
      },
    });

    const defaults = await listLimits(payment);
    expect(defaults.offset).toBe(0);
    expect(defaults.limit).toBe(25);
    expect(defaults.totalQuantity).toBe(5);
    expect(defaults.totalPage).toBe(1);
    expect(defaults.currentPage).toBe(1);

    // Paged in an explicit order: in the default one (creation stamp, which
    // limits set by one bulk call share) a user turned up on two pages in two of
    // eight fresh portals, and could not be made to repeat inside one.
    const seen: string[] = [];
    for (const [page, offset] of [
      [1, 0],
      [2, 2],
      [3, 4],
    ]) {
      const report = await listLimits(payment, {
        offset,
        limit: 2,
        orderBy: ServiceLimitOrderBy.Participant,
      });
      expect(report.offset).toBe(offset);
      expect(report.limit).toBe(2);
      expect(report.totalQuantity).toBe(5);
      expect(report.totalPage).toBe(3);
      expect(report.currentPage).toBe(page);
      expect(report.collection).toHaveLength(page === 3 ? 1 : 2);
      seen.push(...report.collection!.map((item) => item.userId!));
    }
    expect(new Set(seen).size, "no user on two pages").toBe(5);
    expect([...seen].sort()).toEqual([...users].sort());

    const past = await listLimits(payment, { offset: 10, limit: 2 });
    expect(past.collection ?? []).toEqual([]);
    expect(past.totalQuantity).toBe(5);
  });

  test("limit is capped at 100 and offset cannot be negative", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    expect(
      (await payment.getParticipantServiceLimits({ limit: 100 })).status,
    ).toBe(200);
    for (const limit of [0, -1, 101]) {
      const { status, data } = await payment.getParticipantServiceLimits({
        limit,
      });
      expect(status, `limit ${limit}`).toBe(400);
      expect(errorMessage(data)).toContain("Limit must be between 1 and 100");
    }
    const { status, data } = await payment.getParticipantServiceLimits({
      offset: -1,
    });
    expect(status).toBe(400);
    expect(errorMessage(data)).toContain("Offset must be between 0");
  });

  test("sorts by creation, newest first by default, and by participant, in both directions", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const users = await addUsers(apiSdk, 4);
    const createdOrder: string[] = [];
    for (const userId of users) {
      await createCustom(payment, userId, 1);
      createdOrder.push(userId);
    }
    const ids = async (params: Parameters<typeof listLimits>[1]) =>
      ((await listLimits(payment, params)).collection ?? []).map(
        (item) => item.userId!,
      );

    expect(await ids({}), "default: newest first").toEqual(
      [...createdOrder].reverse(),
    );
    expect(
      await ids({
        orderBy: ServiceLimitOrderBy.Created,
        orderType: OperationOrderType.Descending,
      }),
    ).toEqual([...createdOrder].reverse());
    expect(
      await ids({
        orderBy: ServiceLimitOrderBy.Created,
        orderType: OperationOrderType.Ascending,
      }),
    ).toEqual(createdOrder);

    const byUserAsc = await ids({
      orderBy: ServiceLimitOrderBy.Participant,
      orderType: OperationOrderType.Ascending,
    });
    const byUserDesc = await ids({
      orderBy: ServiceLimitOrderBy.Participant,
      orderType: OperationOrderType.Descending,
    });
    expect([...byUserAsc].sort()).toEqual([...users].sort());
    expect(byUserDesc).toEqual([...byUserAsc].reverse());
  });
});
