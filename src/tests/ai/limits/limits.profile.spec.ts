import { test, expect } from "./limits-fixtures";
import {
  LimitPeriod,
  createCustom,
  createGlobal,
  createTotal,
  periodName,
  pollUntil,
  provisionBilling,
  scopeName,
  updateLimit,
} from "@/src/helpers/service-limits";
import { UserServiceLimitDto } from "@onlyoffice/docspace-api-sdk";

// `EmployeeFullDto.aiServicesLimit`: the limit in force for a user - the personal
// one, or else the one for every user - with what the user spent against it. The
// JSDoc says it is null for a caller who is neither a DocSpace administrator nor
// the user, that the portal-wide Total limit is not reflected here, and that the
// value "can lag by a few minutes", so every read of it polls for the state
// instead of asking once.

type Limit = UserServiceLimitDto | undefined;

/** Polls a profile read until its `aiServicesLimit` satisfies `done`. */
async function awaitLimit(
  read: () => Promise<Limit>,
  done: (limit: Limit) => boolean,
): Promise<Limit> {
  return pollUntil(read, done, { timeoutMs: 60000, intervalMs: 1500 });
}

test.describe("EmployeeFullDto.aiServicesLimit", () => {
  test("a user with no limit in force has none, whoever asks", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const user = await makeMember("User");
    const owner = apiSdk.forRole("owner");
    // The Total limit is not a per-user limit and is not reflected.
    await createTotal(owner.payment, 5);

    const own = (await user.api.profiles.getSelfProfile()).data.response;
    const seenByOwner = (
      await owner.profiles.getProfileByUserId({ userId: user.id })
    ).data.response;

    expect(own?.aiServicesLimit ?? null).toBeNull();
    expect(seenByOwner?.aiServicesLimit ?? null).toBeNull();
  });

  test("a personal limit shows to the user, to the owner and to a DocSpace admin with the same figures", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const user = await makeMember("User");
    const admin = await makeMember("DocSpaceAdmin");
    const owner = apiSdk.forRole("owner");
    const custom = await createCustom(
      owner.payment,
      user.id,
      1.5,
      LimitPeriod.Week,
    );

    const readers = {
      self: () => user.api.profiles.getSelfProfile(),
      owner: () => owner.profiles.getProfileByUserId({ userId: user.id }),
      admin: () => admin.api.profiles.getProfileByUserId({ userId: user.id }),
    };
    for (const [who, read] of Object.entries(readers)) {
      const limit = await awaitLimit(
        async () => (await read()).data.response?.aiServicesLimit,
        (value) => value !== undefined && value !== null,
      );
      expect(limit?.id, who).toBe(custom.id);
      expect(scopeName(limit), who).toBe("Custom");
      expect(limit?.amountValue, who).toBe(1.5);
      expect(limit?.amountConsumed, who).toBe(0);
      expect(limit?.currency, who).toBe("USD");
      expect(periodName(limit), who).toBe("Week");
      expect(limit?.periodEnd, who).toBeTruthy();
    }
  });

  test("another user does not see someone else's limit", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const subject = await makeMember("User");
    const stranger = await makeMember("RoomAdmin");
    const owner = apiSdk.forRole("owner");
    await createCustom(owner.payment, subject.id, 1);

    // Positive control first: the subject does see it, so the null below is the
    // caller's doing and not a limit that never took.
    const own = await awaitLimit(
      async () =>
        (await subject.api.profiles.getSelfProfile()).data.response
          ?.aiServicesLimit,
      (value) => !!value,
    );
    expect(own?.amountValue).toBe(1);

    const seenByStranger = (
      await stranger.api.profiles.getProfileByUserId({ userId: subject.id })
    ).data.response;
    expect(seenByStranger?.id).toBe(subject.id);
    expect(seenByStranger?.aiServicesLimit ?? null).toBeNull();
  });

  test("without a personal limit the Global one shows, and a personal one takes over from it", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const user = await makeMember("User");
    const owner = apiSdk.forRole("owner");
    const global = await createGlobal(owner.payment, 3, LimitPeriod.Day);
    const read = async () =>
      (await user.api.profiles.getSelfProfile()).data.response?.aiServicesLimit;

    const inherited = await awaitLimit(read, (v) => !!v);
    expect(scopeName(inherited)).toBe("Global");
    expect(inherited?.id).toBe(global.id);
    expect(inherited?.amountValue).toBe(3);

    const custom = await createCustom(
      owner.payment,
      user.id,
      1,
      LimitPeriod.Day,
    );
    const own = await awaitLimit(read, (v) => scopeName(v) === "Custom");
    expect(own?.id).toBe(custom.id);
    expect(own?.amountValue).toBe(1);
  });

  test("deleting the personal limit hands the user back to the Global one", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const user = await makeMember("User");
    const owner = apiSdk.forRole("owner");
    const global = await createGlobal(owner.payment, 3);
    const custom = await createCustom(owner.payment, user.id, 1);
    const read = async () =>
      (await user.api.profiles.getSelfProfile()).data.response?.aiServicesLimit;
    await awaitLimit(read, (v) => scopeName(v) === "Custom");

    await owner.payment.deleteServiceLimit({ id: custom.id! });

    const back = await awaitLimit(read, (v) => scopeName(v) === "Global");
    expect(back?.id).toBe(global.id);
    expect(back?.amountValue).toBe(3);
  });

  test("switching the personal limit off does the same as deleting it", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const user = await makeMember("User");
    const owner = apiSdk.forRole("owner");
    const global = await createGlobal(owner.payment, 3);
    const custom = await createCustom(owner.payment, user.id, 1);
    const read = async () =>
      (await user.api.profiles.getSelfProfile()).data.response?.aiServicesLimit;
    await awaitLimit(read, (v) => scopeName(v) === "Custom");

    await updateLimit(owner.payment, { id: custom.id!, enabled: false });

    const back = await awaitLimit(read, (v) => scopeName(v) === "Global");
    expect(back?.id).toBe(global.id);

    await updateLimit(owner.payment, { id: custom.id!, enabled: true });
    const again = await awaitLimit(read, (v) => scopeName(v) === "Custom");
    expect(again?.id).toBe(custom.id);
  });

  test("with the only limit deleted, the user has no limit again", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const user = await makeMember("User");
    const owner = apiSdk.forRole("owner");
    const custom = await createCustom(owner.payment, user.id, 1);
    const read = async () =>
      (await user.api.profiles.getSelfProfile()).data.response?.aiServicesLimit;
    await awaitLimit(read, (v) => !!v);

    await owner.payment.deleteServiceLimit({ id: custom.id! });

    const gone = await awaitLimit(read, (v) => !v);
    expect(gone ?? null).toBeNull();
  });

  test("a switched-off Global limit is not shown", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const user = await makeMember("User");
    const owner = apiSdk.forRole("owner");
    const global = await createGlobal(owner.payment, 3);
    const read = async () =>
      (await user.api.profiles.getSelfProfile()).data.response?.aiServicesLimit;
    await awaitLimit(read, (v) => !!v);

    await updateLimit(owner.payment, { id: global.id!, enabled: false });

    expect((await awaitLimit(read, (v) => !v)) ?? null).toBeNull();
  });

  test("an amount lowered by an update shows in the profile", async ({
    apiSdk,
    paymentsApi,
    makeMember,
  }) => {
    await provisionBilling(paymentsApi);
    const user = await makeMember("User");
    const owner = apiSdk.forRole("owner");
    const custom = await createCustom(owner.payment, user.id, 5);
    const read = async () =>
      (await user.api.profiles.getSelfProfile()).data.response?.aiServicesLimit;
    await awaitLimit(read, (v) => v?.amountValue === 5);

    await updateLimit(owner.payment, { id: custom.id!, amountValue: 0.5 });

    const lowered = await awaitLimit(read, (v) => v?.amountValue === 0.5);
    expect(lowered?.amountValue).toBe(0.5);
    expect(lowered?.id).toBe(custom.id);
  });
});
