import { test, expect } from "./limits-fixtures";
import {
  LimitPeriod,
  LimitScope,
  createCustom,
  createGlobal,
  createTotal,
  errorMessage,
  listLimits,
  provisionBilling,
  readGlobal,
  readLimit,
  readTotal,
  scopeName,
} from "@/src/helpers/service-limits";
import { UserType } from "@/src/services/api-sdk";

// Who may read and write the spending limits. The JSDoc says "a DocSpace
// administrator", and the portal owner is one; the rest is measured:
//
//   Owner, DocSpaceAdmin   200 on all nine routes
//   RoomAdmin, User, Guest 403 "Access denied" on all nine, reads included
//   Anonymous              401
//
// A role that is refused must also leave the limits as they were - a 403 that
// still wrote would pass a status check - so each refused role is followed by a
// snapshot comparison.

type Actor =
  | { name: string; kind: "owner"; status: 200 }
  | { name: string; kind: "member"; type: UserType; status: 200 | 403 }
  | { name: string; kind: "anonymous"; status: 401 };

const ACTORS: Actor[] = [
  { name: "Owner", kind: "owner", status: 200 },
  { name: "DocSpaceAdmin", kind: "member", type: "DocSpaceAdmin", status: 200 },
  { name: "RoomAdmin", kind: "member", type: "RoomAdmin", status: 403 },
  { name: "User", kind: "member", type: "User", status: 403 },
  { name: "Guest", kind: "member", type: "Guest", status: 403 },
  { name: "Anonymous", kind: "anonymous", status: 401 },
];

for (const actor of ACTORS) {
  test(`/portal/payment/servicelimit* - ${actor.name} gets ${actor.status} on every route`, async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const ownerPayment = apiSdk.forRole("owner").payment;
    const { data: first } = await apiSdk.addMember("owner", "User");
    const { data: second } = await apiSdk.addMember("owner", "User");
    const firstId = first.response!.id!;
    const secondId = second.response!.id!;

    const total = await createTotal(ownerPayment, 10, LimitPeriod.Month);
    const global = await createGlobal(ownerPayment, 2, LimitPeriod.Day);
    const custom = await createCustom(ownerPayment, firstId, 1);

    const snapshot = async () =>
      JSON.stringify({
        total: await readTotal(ownerPayment),
        global: await readGlobal(ownerPayment),
        list: (await listLimits(ownerPayment)).collection,
        custom: await readLimit(ownerPayment, custom.id!),
      });
    const before = await snapshot();

    const payment =
      actor.kind === "owner"
        ? ownerPayment
        : actor.kind === "anonymous"
          ? apiSdk.forAnonymous().payment
          : (await makeMember(actor.type)).api.payment;

    const calls = {
      getTotal: await payment.getTotalServiceLimit(),
      getGlobal: await payment.getGlobalServiceLimit(),
      getById: await payment.getServiceLimit({ id: custom.id! }),
      list: await payment.getParticipantServiceLimits(),
      create: await payment.createServiceLimit({
        createServiceLimitRequestDto: {
          scope: LimitScope.Custom,
          userId: secondId,
          amountValue: 4,
          period: LimitPeriod.Week,
        },
      }),
      update: await payment.updateServiceLimit({
        updateServiceLimitRequestDto: { id: total.id!, amountValue: 3 },
      }),
      bulk: await payment.setParticipantServiceLimits({
        setParticipantServiceLimitsRequestDto: {
          userIds: [secondId],
          amountValue: 2,
          period: LimitPeriod.Month,
        },
      }),
      disable: await payment.disableParticipantServiceLimits(),
      remove: await payment.deleteServiceLimit({ id: custom.id! }),
    };

    for (const [name, response] of Object.entries(calls)) {
      expect(response.status, `${actor.name} ${name}`).toBe(actor.status);
      if (actor.status === 403) {
        expect(errorMessage(response.data), name).toBe("Access denied");
      }
    }

    if (actor.status === 200) {
      await test.step("the writes took effect", async () => {
        expect((await readTotal(ownerPayment))?.amountValue).toBe(3);
        expect((await readTotal(ownerPayment))?.id).toBe(total.id);
        expect(
          (await ownerPayment.getServiceLimit({ id: custom.id! })).status,
          "the personal limit was deleted",
        ).toBe(404);
        // Set by the bulk call, then switched off by `disable`, so it is kept
        // but no longer listed.
        expect(
          (await listLimits(ownerPayment)).collection?.some(
            (item) => item.userId === secondId && scopeName(item) === "Custom",
          ),
        ).toBeFalsy();
        expect((await readGlobal(ownerPayment))?.id).toBe(global.id);
      });
    } else {
      await test.step("nothing was changed", async () => {
        expect(await snapshot()).toBe(before);
      });
    }
  });
}
