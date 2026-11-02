import { test, expect } from "./limits-fixtures";
import {
  LimitPeriod,
  LimitScope,
  createCustom,
  createGlobal,
  createLimit,
  createTotal,
  deleteLimit,
  errorMessage,
  listLimits,
  provisionBilling,
  periodName,
  readGlobal,
  readLimit,
  readTotal,
  scopeName,
  updateLimit,
} from "@/src/helpers/service-limits";

// Create / read / update / delete of the spending limits on the AI services,
// with every write proved by a later read. These tests spend nothing: a limit is
// only a number until an AI call meets it. The billing customer a limit needs is
// created by `provisionBilling`; without it every call answers 404 (see the
// validation file).

const AI_SERVICES = "ai-services";

test.describe("Service limits - create and read back", () => {
  test("POST /portal/payment/servicelimit - Owner creates the Total limit and it is read back from total and by id", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const created = await createTotal(payment, 5, LimitPeriod.Month);
    expect(scopeName(created)).toBe("Total");
    expect(periodName(created)).toBe("Month");
    expect(created.amountValue).toBe(5);
    expect(created.currency).toBe("USD");
    expect(created.serviceGroupName).toBe(AI_SERVICES);
    expect(created.enabled).toBe(true);
    expect(created.userId ?? null).toBeNull();
    expect(created.quantityValue ?? null).toBeNull();

    await test.step("GET /servicelimit/total returns it, with nothing spent yet", async () => {
      const total = await readTotal(payment);
      expect(total?.id).toBe(created.id);
      expect(total?.amountValue).toBe(5);
      expect(total?.enabled).toBe(true);
      expect(total?.usage?.amountConsumed).toBe(0);
      expect(total?.usage?.amountAvailable).toBe(5);
      expect(total?.usage?.quantityConsumed).toBe(0);
    });

    await test.step("GET /servicelimit/{id} returns the same limit without the spending", async () => {
      const byId = await readLimit(payment, created.id!);
      expect(byId.id).toBe(created.id);
      expect(scopeName(byId)).toBe("Total");
      expect(byId.amountValue).toBe(5);
      expect(byId.usage ?? null).toBeNull();
    });
  });

  test("POST /portal/payment/servicelimit - Owner creates the Global limit and it is read back from global and by id", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const created = await createGlobal(payment, 2, LimitPeriod.Day);
    expect(scopeName(created)).toBe("Global");
    expect(periodName(created)).toBe("Day");
    expect(created.userId ?? null).toBeNull();

    const global = await readGlobal(payment);
    expect(global?.id).toBe(created.id);
    expect(global?.amountValue).toBe(2);
    // The spending of a per-user limit is counted per user, so the limit read on
    // its own has none, but still says when the period ends for everyone.
    expect(global?.usage ?? null).toBeNull();
    expect(global?.periodEnd).toBeTruthy();

    const byId = await readLimit(payment, created.id!);
    expect(scopeName(byId)).toBe("Global");
    expect(byId.amountValue).toBe(2);

    // Neither of the other two scopes appeared on the way.
    expect(await readTotal(payment)).toBeUndefined();
  });

  test("POST /portal/payment/servicelimit - Owner creates a Custom limit for a user and it is read back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const { data: user } = await apiSdk.addMember("owner", "User");
    const userId = user.response!.id!;

    const created = await createCustom(payment, userId, 1, LimitPeriod.Week);
    expect(scopeName(created)).toBe("Custom");
    expect(created.userId).toBe(userId);
    expect(periodName(created)).toBe("Week");

    const byId = await readLimit(payment, created.id!);
    expect(byId.userId).toBe(userId);
    expect(byId.amountValue).toBe(1);
    expect(byId.enabled).toBe(true);

    const report = await listLimits(payment);
    const row = report.collection?.find((item) => item.userId === userId);
    expect(row?.id).toBe(created.id);
    expect(scopeName(row)).toBe("Custom");
    expect(row?.usage?.amountConsumed).toBe(0);
    expect(row?.usage?.amountAvailable).toBe(1);
  });

  test("GET /portal/payment/servicelimit/total, global - a portal without limits answers 200 with no limit, and the list is empty", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    expect(await readTotal(payment)).toBeUndefined();
    expect(await readGlobal(payment)).toBeUndefined();
    const report = await listLimits(payment);
    expect(report.collection ?? []).toEqual([]);
    expect(report.totalQuantity).toBe(0);
  });

  test("POST /portal/payment/servicelimit - the three scopes coexist and each is read on its own", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const { data: user } = await apiSdk.addMember("owner", "User");
    const userId = user.response!.id!;

    const total = await createTotal(payment, 10);
    const global = await createGlobal(payment, 3);
    const custom = await createCustom(payment, userId, 1);
    expect(new Set([total.id, global.id, custom.id]).size).toBe(3);

    expect((await readTotal(payment))?.id).toBe(total.id);
    expect((await readGlobal(payment))?.id).toBe(global.id);
    expect((await readLimit(payment, custom.id!)).userId).toBe(userId);
  });
});

test.describe("Service limits - thresholds and periods", () => {
  test("POST /portal/payment/servicelimit - an omitted period defaults to Day", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const created = await createLimit(payment, {
      scope: LimitScope.Total,
      amountValue: 1,
    });
    expect(periodName(created)).toBe("Day");
    expect(periodName(await readLimit(payment, created.id!))).toBe("Day");
  });

  test("POST /portal/payment/servicelimit - zero is stored and leaves nothing available", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    await createTotal(payment, 0);
    const total = await readTotal(payment);
    expect(total?.amountValue).toBe(0);
    expect(total?.enabled).toBe(true);
    expect(total?.usage?.amountAvailable).toBe(0);
  });

  for (const amount of [0.0001, 1.23456, 9999.9999, 10000]) {
    test(`POST /portal/payment/servicelimit - amountValue ${amount} is stored exactly as given`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await provisionBilling(paymentsApi);
      const payment = apiSdk.forRole("owner").payment;

      const created = await createTotal(payment, amount);
      expect(created.amountValue).toBe(amount);
      expect((await readLimit(payment, created.id!)).amountValue).toBe(amount);
      expect((await readTotal(payment))?.usage?.amountAvailable).toBe(amount);
    });
  }

  // The period windows are UTC and calendar-aligned. They are derived from the
  // server's own `created` stamp, not from this machine's clock, so a run that
  // straddles midnight UTC cannot disagree with itself.
  const startOfUtcDay = (value: string) => {
    const date = new Date(value);
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
    );
  };
  const DAY = 24 * 3600 * 1000;

  test("POST /portal/payment/servicelimit - a Day limit's period runs from midnight UTC to the end of that UTC day", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const created = await createTotal(payment, 1, LimitPeriod.Day);
    const dayStart = startOfUtcDay(created.created!);
    const total = await readTotal(payment);

    expect(new Date(total!.usage!.periodStart!).getTime()).toBe(dayStart);
    // 23:59:59.9999999 - the last tick before the next period.
    expect(new Date(total!.usage!.periodEnd!).getTime()).toBeGreaterThanOrEqual(
      dayStart + DAY - 1,
    );
    expect(new Date(total!.usage!.periodEnd!).getTime()).toBeLessThan(
      dayStart + DAY,
    );
    expect(total!.periodEnd).toBeTruthy();
    expect(new Date(total!.periodEnd!).getTime()).toBe(
      new Date(total!.usage!.periodEnd!).getTime(),
    );
  });

  test("POST /portal/payment/servicelimit - a Week limit's period starts on Monday 00:00 UTC and ends on Sunday", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    await createTotal(payment, 1, LimitPeriod.Week);
    const usage = (await readTotal(payment))!.usage!;
    const start = new Date(usage.periodStart!);
    const end = new Date(usage.periodEnd!);

    expect(start.getUTCDay(), "Monday").toBe(1);
    expect(start.getUTCHours() + start.getUTCMinutes()).toBe(0);
    expect(end.getUTCDay(), "Sunday").toBe(0);
    expect(end.getTime() - start.getTime()).toBeGreaterThan(7 * DAY - 1000);
    expect(end.getTime() - start.getTime()).toBeLessThan(7 * DAY);
  });

  test("POST /portal/payment/servicelimit - a Month limit's period is the calendar month in UTC", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const created = await createTotal(payment, 1, LimitPeriod.Month);
    const usage = (await readTotal(payment))!.usage!;
    const start = new Date(usage.periodStart!);
    const end = new Date(usage.periodEnd!);
    const created_ = new Date(created.created!);

    expect(start.getUTCDate()).toBe(1);
    expect(start.getUTCMonth()).toBe(created_.getUTCMonth());
    expect(start.getUTCHours() + start.getUTCMinutes()).toBe(0);
    // The last tick of the month: one tick later is the first of the next one.
    const next = new Date(end.getTime() + 1);
    expect(next.getUTCDate()).toBe(1);
    expect(next.getUTCMonth()).toBe((created_.getUTCMonth() + 1) % 12);
  });

  test("POST /portal/payment/servicelimit - a Lifetime limit never resets and counts from its creation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const created = await createTotal(payment, 1, LimitPeriod.Lifetime);
    expect(periodName(created)).toBe("Lifetime");
    expect(created.periodEnd ?? null).toBeNull();
    expect(created.usageFrom).toBeTruthy();

    const total = await readTotal(payment);
    expect(total?.periodEnd ?? null).toBeNull();
    expect(total?.usage?.periodEnd ?? null).toBeNull();
    expect(
      Math.abs(
        new Date(total!.usageFrom!).getTime() -
          new Date(created.created!).getTime(),
      ),
      "usageFrom is the moment of creation",
    ).toBeLessThan(5000);

    // Not a lifetime limit: no usageFrom.
    await deleteLimit(payment, created.id!);
    const day = await createTotal(payment, 1, LimitPeriod.Day);
    expect(day.usageFrom ?? null).toBeNull();
  });
});

test.describe("Service limits - update", () => {
  test("PUT /portal/payment/servicelimit - changing the amount keeps scope, period and state, and is read back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const created = await createTotal(payment, 5, LimitPeriod.Week);

    const updated = await updateLimit(payment, {
      id: created.id!,
      amountValue: 7.5,
    });
    expect(updated.amountValue).toBe(7.5);

    const total = await readTotal(payment);
    expect(total?.amountValue).toBe(7.5);
    expect(scopeName(total)).toBe("Total");
    expect(periodName(total)).toBe("Week");
    expect(total?.enabled).toBe(true);
    expect(total?.created).toBe(created.created);
    expect(total?.usage?.amountAvailable).toBe(7.5);
    expect(
      new Date(total!.modified!).getTime(),
      "modified moves on",
    ).toBeGreaterThan(new Date(created.modified!).getTime());
  });

  test("PUT /portal/payment/servicelimit - an update with only the id changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const created = await createTotal(payment, 5, LimitPeriod.Month);

    await updateLimit(payment, { id: created.id! });

    const after = await readLimit(payment, created.id!);
    expect(after.amountValue).toBe(5);
    expect(after.enabled).toBe(true);
    expect(periodName(after)).toBe("Month");
  });

  test("PUT /portal/payment/servicelimit - scope, user and period cannot be changed by an update", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const { data: user } = await apiSdk.addMember("owner", "User");
    const userId = user.response!.id!;
    const created = await createCustom(payment, userId, 1, LimitPeriod.Day);
    const { data: other } = await apiSdk.addMember("owner", "User");

    // The update body has no such fields; sending them anyway must not move
    // the limit to another scope, user or window.
    const { status } = await payment.updateServiceLimit({
      updateServiceLimitRequestDto: {
        id: created.id!,
        amountValue: 2,
        scope: LimitScope.Total,
        userId: other.response!.id!,
        period: LimitPeriod.Lifetime,
      } as never,
    });
    expect(status).toBe(200);

    const after = await readLimit(payment, created.id!);
    expect(after.amountValue).toBe(2);
    expect(scopeName(after)).toBe("Custom");
    expect(after.userId).toBe(userId);
    expect(periodName(after)).toBe("Day");
  });

  test("PUT /portal/payment/servicelimit - switching a limit off and on is read back, and total keeps returning it while off", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const created = await createTotal(payment, 5);

    await updateLimit(payment, { id: created.id!, enabled: false });
    const off = await readTotal(payment);
    expect(off?.id).toBe(created.id);
    expect(off?.enabled).toBe(false);
    expect(off?.amountValue, "a switched-off limit keeps its settings").toBe(5);
    expect((await readLimit(payment, created.id!)).enabled).toBe(false);

    await updateLimit(payment, { id: created.id!, enabled: true });
    expect((await readTotal(payment))?.enabled).toBe(true);
  });

  test("PUT /portal/payment/servicelimit - lowering the amount below the spending is accepted and leaves nothing available", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const created = await createTotal(payment, 5);

    await updateLimit(payment, { id: created.id!, amountValue: 0 });

    const total = await readTotal(payment);
    expect(total?.amountValue).toBe(0);
    expect(total?.usage?.amountAvailable).toBe(0);
  });
});

test.describe("Service limits - delete", () => {
  test("DELETE /portal/payment/servicelimit/{id} - removes the limit completely, and it can be created anew", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const created = await createTotal(payment, 5);

    await deleteLimit(payment, created.id!);

    expect(await readTotal(payment)).toBeUndefined();
    const { status } = await payment.getServiceLimit({ id: created.id! });
    expect(status).toBe(404);

    const again = await createTotal(payment, 6);
    expect(again.id).not.toBe(created.id);
    expect((await readTotal(payment))?.amountValue).toBe(6);
  });

  test("DELETE /portal/payment/servicelimit/{id} - deleting a Global limit leaves Total and Custom alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const { data: user } = await apiSdk.addMember("owner", "User");
    const total = await createTotal(payment, 10);
    const global = await createGlobal(payment, 3);
    const custom = await createCustom(payment, user.response!.id!, 1);

    await deleteLimit(payment, global.id!);

    expect(await readGlobal(payment)).toBeUndefined();
    expect((await readTotal(payment))?.id).toBe(total.id);
    expect((await readLimit(payment, custom.id!)).amountValue).toBe(1);
  });

  test("DELETE /portal/payment/servicelimit/{id} - a repeated deletion answers 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const created = await createTotal(payment, 5);

    await deleteLimit(payment, created.id!);
    const { status, data } = await payment.deleteServiceLimit({
      id: created.id!,
    });
    expect(status).toBe(404);
    expect(errorMessage(data)).toBe("Service limit could not be found");
  });
});
