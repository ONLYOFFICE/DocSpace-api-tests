import { randomUUID } from "node:crypto";
import { test, expect } from "./limits-fixtures";
import {
  LimitPeriod,
  LimitScope,
  createCustom,
  createGlobal,
  createTotal,
  errorMessage,
  limitOfUser,
  provisionBilling,
  readGlobal,
  readLimit,
  readTotal,
} from "@/src/helpers/service-limits";

// What the limit routes refuse, and with what. The messages quoted are the
// server's own, measured 2026-11-02; where a test pins one it is because the
// text is how a client tells the refusals apart (400 comes in two envelopes: the
// model validator's `errors` map and a plain `error.message`).
//
// Every refusal is followed by a read: a refused write that still changed the
// stored limit would otherwise look like a clean 400.

const ZERO_USER = "00000000-0000-0000-0000-000000000000";
const NO_THRESHOLD = "Either the amount or the quantity threshold must be set";
const QUANTITY_REFUSED =
  "Services of group 'ai-services' have different units, a quantity threshold can not be set";
const AMOUNT_RANGE = "The field AmountValue must be between 0 and 10000.";
const DUPLICATE =
  "Service group 'ai-services' already has a limit for this scope";

test.describe("Service limits - no billing customer", () => {
  test("GET/POST/PUT/DELETE /portal/payment/servicelimit* - a portal without a billing customer answers 404 on every route", async ({
    apiSdk,
  }) => {
    const payment = apiSdk.forRole("owner").payment;
    const unknownId = 1;

    const calls = {
      total: await payment.getTotalServiceLimit(),
      global: await payment.getGlobalServiceLimit(),
      list: await payment.getParticipantServiceLimits(),
      byId: await payment.getServiceLimit({ id: unknownId }),
      create: await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          scope: LimitScope.Total,
          amountValue: 1,
          period: LimitPeriod.Month,
        },
      }),
      update: await payment.updateServiceLimit({
        updateServiceLimitRequestDto: { id: unknownId, amountValue: 1 },
      }),
      remove: await payment.deleteServiceLimit({ id: unknownId }),
      bulk: await payment.setParticipantServiceLimits({
        setParticipantServiceLimitsRequestDto: {
          userIds: [ZERO_USER],
          amountValue: 1,
        },
      }),
      disable: await payment.disableParticipantServiceLimits(),
    };

    for (const [name, response] of Object.entries(calls)) {
      expect(response.status, name).toBe(404);
      expect(errorMessage(response.data), name).toBe(
        "Customer could not be found",
      );
    }
  });

  // A portal that has set payment up but never funded its wallet has no billing
  // customer either - the reads answer as if it had, and the writes that need one
  // fall over with an unhandled AccountingCustomerNotFoundException. The routes
  // promise 404 for "no billing customer".
  test.fail(
    "BUG 84837: POST /portal/payment/servicelimit - a portal with payment set up but no wallet answers 404, not 500",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();
      const payment = apiSdk.forRole("owner").payment;

      const { status, data } = await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          scope: LimitScope.Total,
          amountValue: 1,
          period: LimitPeriod.Month,
        },
      });

      expect(status, errorMessage(data)).toBe(404);
    },
  );

  test.fail(
    "BUG 84837: POST /portal/payment/servicelimit/participants/disable - a portal with payment set up but no wallet answers 404, not 500",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();
      const payment = apiSdk.forRole("owner").payment;

      const { status, data } = await payment.disableParticipantServiceLimits();

      expect(status, errorMessage(data)).toBe(404);
    },
  );
});

test.describe("Service limits - create validation", () => {
  test("POST /portal/payment/servicelimit - no threshold is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const { status, data } = await payment.createServiceLimit({
      createServiceLimitRequestDto: {
        scope: LimitScope.Total,
        period: LimitPeriod.Month,
      },
    });

    expect(status).toBe(400);
    expect(errorMessage(data)).toBe(NO_THRESHOLD);
    expect(await readTotal(payment)).toBeUndefined();
  });

  test("POST /portal/payment/servicelimit - a quantity threshold is refused for the AI services, alone or next to an amount", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    for (const body of [
      { quantityValue: 5 },
      { quantityValue: 0 },
      { amountValue: 5, quantityValue: 5 },
    ]) {
      const { status, data } = await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          scope: LimitScope.Total,
          period: LimitPeriod.Month,
          ...body,
        },
      });
      expect(status, JSON.stringify(body)).toBe(400);
      expect(errorMessage(data), JSON.stringify(body)).toBe(QUANTITY_REFUSED);
    }
    expect(await readTotal(payment)).toBeUndefined();
  });

  for (const [name, amount] of [
    ["negative", -1],
    ["negative fraction", -0.0001],
    ["above the maximum", 10000.01],
    ["huge", 1e12],
  ] as const) {
    test(`POST /portal/payment/servicelimit - a ${name} amount (${amount}) is refused with the 0..10000 range`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await provisionBilling(paymentsApi);
      const payment = apiSdk.forRole("owner").payment;

      const { status, data } = await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          scope: LimitScope.Total,
          amountValue: amount,
          period: LimitPeriod.Month,
        },
      });

      expect(status).toBe(400);
      expect(errorMessage(data)).toContain(AMOUNT_RANGE);
      expect(await readTotal(payment)).toBeUndefined();
    });
  }

  test("POST /portal/payment/servicelimit - a non-numeric amount is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const { status } = await payment.createServiceLimit({
      createServiceLimitRequestDto: {
        scope: LimitScope.Total,
        amountValue: "abc",
        period: LimitPeriod.Month,
      } as never,
    });

    expect(status).toBe(400);
    expect(await readTotal(payment)).toBeUndefined();
  });

  for (const scope of [0, 4, 99, -1]) {
    test(`POST /portal/payment/servicelimit - scope ${scope} is refused`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await provisionBilling(paymentsApi);
      const payment = apiSdk.forRole("owner").payment;

      const { status, data } = await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          scope,
          amountValue: 5,
          period: LimitPeriod.Month,
        } as never,
      });

      expect(status).toBe(400);
      expect(errorMessage(data)).toContain("The field Scope is invalid");
      expect(await readTotal(payment)).toBeUndefined();
      expect(await readGlobal(payment)).toBeUndefined();
    });
  }

  for (const period of [0, 5, 99, -1]) {
    test(`POST /portal/payment/servicelimit - period ${period} is refused`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await provisionBilling(paymentsApi);
      const payment = apiSdk.forRole("owner").payment;

      const { status, data } = await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          scope: LimitScope.Total,
          amountValue: 5,
          period,
        } as never,
      });

      expect(status).toBe(400);
      expect(errorMessage(data)).toContain("The field Period is invalid");
      expect(await readTotal(payment)).toBeUndefined();
    });
  }

  // `scope` decides whom the limit hits, and leaving it out is not an error: the
  // server files the limit under Total, the portal-wide ceiling. A client that
  // meant a personal limit and dropped the field would silently cap everyone.
  // Whether the default is intended needs a product answer - the JSDoc names
  // `scope` as the thing that says whom the limit applies to and documents no
  // default for it.
  test.fail(
    "BUG 84839: POST /portal/payment/servicelimit - a request without a scope is refused instead of becoming a portal-wide Total limit",
    async ({ apiSdk, paymentsApi }) => {
      await provisionBilling(paymentsApi);
      const payment = apiSdk.forRole("owner").payment;

      const { status } = await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          amountValue: 5,
          period: LimitPeriod.Month,
        },
      });

      expect(
        await readTotal(payment),
        "no Total limit appeared",
      ).toBeUndefined();
      expect(status).toBe(400);
    },
  );
});

test.describe("Service limits - the user of a limit", () => {
  test("POST /portal/payment/servicelimit - a Custom limit needs the user it is set for", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const { status, data } = await payment.createServiceLimit({
      createServiceLimitRequestDto: {
        scope: LimitScope.Custom,
        amountValue: 5,
        period: LimitPeriod.Day,
      },
    });

    expect(status).toBe(400);
    expect(errorMessage(data)).toBe(
      "A personal limit needs the user it is set for",
    );
  });

  for (const scope of [LimitScope.Total, LimitScope.Global]) {
    test(`POST /portal/payment/servicelimit - a user is refused on scope ${scope === LimitScope.Total ? "Total" : "Global"}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await provisionBilling(paymentsApi);
      const payment = apiSdk.forRole("owner").payment;
      const { data: user } = await apiSdk.addMember("owner", "User");

      const { status, data } = await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          scope,
          userId: user.response!.id!,
          amountValue: 5,
          period: LimitPeriod.Day,
        },
      });

      expect(status).toBe(400);
      expect(errorMessage(data)).toBe(
        "Only a personal limit is set for a user",
      );
      expect(await readTotal(payment)).toBeUndefined();
      expect(await readGlobal(payment)).toBeUndefined();
    });
  }

  test("POST /portal/payment/servicelimit - an unknown user answers 404 and a malformed id answers 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const unknown = await payment.createServiceLimit({
      createServiceLimitRequestDto: {
        scope: LimitScope.Custom,
        userId: ZERO_USER,
        amountValue: 5,
        period: LimitPeriod.Day,
      },
    });
    expect(unknown.status).toBe(404);
    expect(errorMessage(unknown.data)).toBe(
      `User ${ZERO_USER} could not be found`,
    );

    const malformed = await payment.createServiceLimit({
      createServiceLimitRequestDto: {
        scope: LimitScope.Custom,
        userId: "not-a-guid",
        amountValue: 5,
        period: LimitPeriod.Day,
      },
    });
    expect(malformed.status).toBe(400);
  });

  test("POST /portal/payment/servicelimit - a Custom limit can be set for the owner and for each user type", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const ownerId = (await apiSdk.forRole("owner").profiles.getSelfProfile())
      .data.response!.id!;

    const targets = [
      ownerId,
      (await makeMember("DocSpaceAdmin")).id,
      (await makeMember("RoomAdmin")).id,
      (await makeMember("User")).id,
      (await makeMember("Guest")).id,
    ];
    for (const userId of targets) {
      const limit = await createCustom(payment, userId, 1);
      expect((await readLimit(payment, limit.id!)).userId).toBe(userId);
    }
  });
});

test.describe("Service limits - duplicates (409)", () => {
  test("POST /portal/payment/servicelimit - a second Total or Global limit is refused, whatever its period", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const total = await createTotal(payment, 5, LimitPeriod.Month);
    const global = await createGlobal(payment, 2, LimitPeriod.Day);

    for (const [scope, period] of [
      [LimitScope.Total, LimitPeriod.Month],
      [LimitScope.Total, LimitPeriod.Lifetime],
      [LimitScope.Global, LimitPeriod.Day],
      [LimitScope.Global, LimitPeriod.Week],
    ] as const) {
      const { status, data } = await payment.createServiceLimit({
        createServiceLimitRequestDto: { scope, amountValue: 9, period },
      });
      expect(status, `scope ${scope} period ${period}`).toBe(409);
      expect(errorMessage(data)).toBe(DUPLICATE);
    }

    // The originals are untouched.
    expect((await readTotal(payment))?.amountValue).toBe(5);
    expect((await readTotal(payment))?.id).toBe(total.id);
    expect((await readGlobal(payment))?.amountValue).toBe(2);
    expect((await readGlobal(payment))?.id).toBe(global.id);
  });

  test("POST /portal/payment/servicelimit - a second personal limit for the same user is refused, for another user it is not", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const { data: first } = await apiSdk.addMember("owner", "User");
    const { data: second } = await apiSdk.addMember("owner", "User");
    const firstId = first.response!.id!;
    const secondId = second.response!.id!;
    await createCustom(payment, firstId, 1, LimitPeriod.Day);

    const dup = await payment.createServiceLimit({
      createServiceLimitRequestDto: {
        scope: LimitScope.Custom,
        userId: firstId,
        amountValue: 3,
        period: LimitPeriod.Month,
      },
    });
    expect(dup.status).toBe(409);
    expect(errorMessage(dup.data)).toBe(DUPLICATE);
    expect((await limitOfUser(payment, firstId))?.amountValue).toBe(1);

    const other = await createCustom(payment, secondId, 4);
    expect(other.userId).toBe(secondId);
  });
});

test.describe("Service limits - update validation", () => {
  test("GET/PUT/DELETE /portal/payment/servicelimit - an unknown id answers 404, an id outside 1..2147483647 answers 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const unknown = 999999;
    const update = await payment.updateServiceLimit({
      updateServiceLimitRequestDto: { id: unknown, amountValue: 1 },
    });
    const read = await payment.getServiceLimit({ id: unknown });
    const remove = await payment.deleteServiceLimit({ id: unknown });
    for (const response of [update, read, remove]) {
      expect(response.status).toBe(404);
      expect(errorMessage(response.data)).toBe(
        "Service limit could not be found",
      );
    }

    for (const id of [0, -1]) {
      const bad = {
        update: await payment.updateServiceLimit({
          updateServiceLimitRequestDto: { id, amountValue: 1 },
        }),
        read: await payment.getServiceLimit({ id }),
        remove: await payment.deleteServiceLimit({ id }),
      };
      for (const [name, response] of Object.entries(bad)) {
        expect(response.status, `${name} id ${id}`).toBe(400);
        expect(errorMessage(response.data)).toContain(
          "The field Id must be between 1 and 2147483647",
        );
      }
    }
  });

  test("PUT /portal/payment/servicelimit - a quantity, a negative or an out-of-range amount is refused and the limit is unchanged", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const created = await createTotal(payment, 5, LimitPeriod.Month);

    const quantity = await payment.updateServiceLimit({
      updateServiceLimitRequestDto: { id: created.id!, quantityValue: 3 },
    });
    expect(quantity.status).toBe(400);
    expect(errorMessage(quantity.data)).toBe(QUANTITY_REFUSED);

    for (const amountValue of [-2, 10000.01]) {
      const { status, data } = await payment.updateServiceLimit({
        updateServiceLimitRequestDto: { id: created.id!, amountValue },
      });
      expect(status, `amount ${amountValue}`).toBe(400);
      expect(errorMessage(data)).toContain(AMOUNT_RANGE);
    }

    const after = await readLimit(payment, created.id!);
    expect(after.amountValue).toBe(5);
    expect(after.enabled).toBe(true);
  });

  test("PUT /portal/payment/servicelimit - a threshold once set cannot be removed with null", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const created = await createTotal(payment, 5);

    const { status } = await payment.updateServiceLimit({
      updateServiceLimitRequestDto: { id: created.id!, amountValue: null },
    });

    // An omitted or null threshold keeps its value; the limit is never left
    // without one.
    expect(status).toBe(200);
    expect((await readLimit(payment, created.id!)).amountValue).toBe(5);
  });
});

test.describe("Service limits - ids of other portals", () => {
  test("GET/PUT/DELETE /portal/payment/servicelimit - a limit of another portal answers 404 and is left untouched", async ({
    apiSdk,
    paymentsApi,
    foreignPortal,
  }) => {
    await provisionBilling(paymentsApi);
    await provisionBilling(foreignPortal.paymentsApi);
    const ours = apiSdk.forRole("owner").payment;
    const theirs = foreignPortal.sdk.forRole("owner").payment;
    const foreign = await createTotal(theirs, 7, LimitPeriod.Month);

    const read = await ours.getServiceLimit({ id: foreign.id! });
    expect(read.status).toBe(404);

    const update = await ours.updateServiceLimit({
      updateServiceLimitRequestDto: { id: foreign.id!, amountValue: 1 },
    });
    expect(update.status).toBe(404);

    const remove = await ours.deleteServiceLimit({ id: foreign.id! });
    expect(remove.status).toBe(404);

    // Nothing of it reached our reads either.
    expect(await readTotal(ours)).toBeUndefined();

    // And their limit is as they left it.
    const intact = await readLimit(theirs, foreign.id!);
    expect(intact.amountValue).toBe(7);
    expect(intact.enabled).toBe(true);
  });
});

test.describe("Service limits - bulk validation", () => {
  test("POST /portal/payment/servicelimit/participants - an empty user list is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;

    const { status, data } = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: [],
        amountValue: 1,
        period: LimitPeriod.Day,
      },
    });

    expect(status).toBe(400);
    expect(errorMessage(data)).toContain("UserIds");
  });

  test("POST /portal/payment/servicelimit/participants - no threshold and a quantity threshold are refused, and nothing is set", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const { data: user } = await apiSdk.addMember("owner", "User");
    const userId = user.response!.id!;

    const none = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: [userId],
        period: LimitPeriod.Day,
      },
    });
    expect(none.status).toBe(400);
    expect(errorMessage(none.data)).toBe(NO_THRESHOLD);

    const quantity = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: [userId],
        quantityValue: 3,
        period: LimitPeriod.Day,
      },
    });
    expect(quantity.status).toBe(400);
    expect(errorMessage(quantity.data)).toBe(QUANTITY_REFUSED);

    expect(await limitOfUser(payment, userId)).toBeUndefined();
  });

  test("POST /portal/payment/servicelimit/participants - one unknown user refuses the whole call: nobody gets a limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const { data: user } = await apiSdk.addMember("owner", "User");
    const userId = user.response!.id!;

    const { status, data } = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: [userId, ZERO_USER],
        amountValue: 1,
        period: LimitPeriod.Day,
      },
    });

    expect(status).toBe(404);
    expect(errorMessage(data)).toBe(`User ${ZERO_USER} could not be found`);
    expect(await limitOfUser(payment, userId)).toBeUndefined();
  });

  test("POST /portal/payment/servicelimit/participants - a call takes at most 1000 users: 1001 is refused before any user is looked up", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await provisionBilling(paymentsApi);
    const payment = apiSdk.forRole("owner").payment;
    const guids = (count: number) =>
      Array.from({ length: count }, () => randomUUID());

    // 1000 passes the size check and is then refused for the first user that
    // does not exist - proof that the size is not what stopped it.
    const atLimit = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: guids(1000),
        amountValue: 1,
        period: LimitPeriod.Day,
      },
    });
    expect(atLimit.status).toBe(404);
    expect(errorMessage(atLimit.data)).toMatch(/could not be found/);

    const over = await payment.setParticipantServiceLimits({
      setParticipantServiceLimitsRequestDto: {
        userIds: guids(1001),
        amountValue: 1,
        period: LimitPeriod.Day,
      },
    });
    expect(over.status).toBe(400);
    expect(errorMessage(over.data)).toContain("1000");
  });
});
