import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import config from "@/config";
import {
  LOW_BALANCE_THRESHOLD,
  fundWalletBelowThreshold,
  getWalletBalance,
  getWalletTopUpSettings,
} from "@/src/helpers/wallet-services";

// "Low-balance warnings, affecting AI services among others": under $1 the client
// shows a banner — one wording for the Payer, another for the remaining admins —
// and the portal sends the matching letters.
//
// Almost none of that is API-shaped, and it is worth being explicit about why, so
// nobody later reads this file as covering the requirement end to end:
//
//   * there is no low-balance route, field or audit action anywhere. Searching the
//     SDK for lowBalance/threshold/insufficient/warning finds nothing, and the
//     wallet's audit actions stop at CustomerWalletToppedUp (6061),
//     CustomerOperationPerformed (6062) and the two settings ones (6064, 6067).
//     `GET /settings/banner` is the promotional-banner flag, unrelated to money.
//   * so the $1 threshold is a client constant, and the *banner* — its text, which
//     of the two variants renders, the CTA — is a UI test.
//   * the letters are not observable from here either: the suite has no mailbox
//     client, and no audit action records a low-balance notification.
//
// What the API does answer, and what these tests cover, is everything the banner
// is computed from and everything that must not break under it:
//
//   the balance itself         GET /portal/payment/customer/balance
//   Payer vs the other admins  GET /portal/payment/customerinfo  (`payer`)
//   who may see it at all      the permission matrix in payments.permissions.spec.ts
//   auto top-up, i.e. the API side of "prevent interruption of paid services"
//                              GET/POST /portal/payment/topupsettings
//   the subscription remainder offered as a way out — payer-only, unlike the rest
//                              GET /portal/payment/subscription/balance
//
// The AI half — that a sub-threshold balance warns but does not actually cut
// inference off — lives with the other two money states in
// src/tests/ai/chat/chat.ai-disabled.spec.ts, so the three cannot merge into one
// expectation.

/** Under $1, and small enough that no rounding could lift it over the line. */
const LOW_AMOUNT = 0.5;

test.describe("GET /api/2.0/portal/payment/customer/balance - low wallet balance", () => {
  test("GET /api/2.0/portal/payment/customer/balance - Owner reads a balance below the low-balance threshold", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(LOW_AMOUNT);

    const { data, status } = await ownerApi.payment.getCustomerBalance();

    expect(status).toBe(200);
    // The exact number, not just "under a dollar": the banner is a comparison
    // against this value, so a balance the accounting service floors to 0 — or
    // rounds up to 1 — is a different product than one that reports 0.50.
    expect(data.response?.accountCurrency).toBe("USD");
    const account = (data.response?.subAccounts ?? []).find(
      (sub) => sub.currency === "USD",
    );
    expect(account?.amount).toBeCloseTo(LOW_AMOUNT, 2);
    expect(account?.amount).toBeLessThan(LOW_BALANCE_THRESHOLD);
    expect(account?.amount).toBeGreaterThan(0);
    // A sub-threshold wallet is still a funded wallet: the last credit is the
    // fractional top-up, not a missing record.
    expect(data.response?.lastCredit?.amount).toBeCloseTo(LOW_AMOUNT, 2);
    expect(data.response?.lastCredit?.currency).toBe("USD");
    expect(data.response?.lastCredit?.date).toBeDefined();
  });

  test("GET /api/2.0/portal/payment/customer/balance - DocSpaceAdmin reads the same low balance as the Owner", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Both banner variants are driven by one number, so both audiences have to be
    // handed the same one. The owner reads first on purpose: `apiSdk.request` is a
    // shared context whose session cookie beats the bearer token, so any owner
    // call made after the admin authenticates would run as the admin.
    const ownerBalance = await fundWalletBelowThreshold(
      paymentsApi,
      apiSdk.forRole("owner").payment,
      LOW_AMOUNT,
    );

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCustomerBalance();

    expect(status).toBe(200);
    expect(data.response?.accountCurrency).toBe("USD");
    const account = (data.response?.subAccounts ?? []).find(
      (sub) => sub.currency === "USD",
    );
    expect(account?.amount).toBeCloseTo(ownerBalance, 2);
    expect(account?.amount).toBeLessThan(LOW_BALANCE_THRESHOLD);
  });

  test("GET /api/2.0/portal/payment/customer/balance - topping the wallet up clears the low-balance state", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The way out of the banner. Without this the suite could only prove a portal
    // can be *put* under the threshold, never that paying lifts it back out —
    // which is the whole point of the warning.
    const ownerApi = apiSdk.forRole("owner");

    const low = await fundWalletBelowThreshold(
      paymentsApi,
      ownerApi.payment,
      LOW_AMOUNT,
    );

    await paymentsApi.makeWalletTopUp(50);

    const raised = await getWalletBalance(ownerApi.payment);
    expect(raised).toBeGreaterThan(low);
    expect(raised).toBeGreaterThan(LOW_BALANCE_THRESHOLD);

    const { data } = await ownerApi.payment.getCustomerBalance();
    expect(data.response?.lastCredit?.amount).toBeCloseTo(50, 2);
  });
});

test.describe("GET /api/2.0/portal/payment/customerinfo - the payer behind the banner variants", () => {
  test("GET /api/2.0/portal/payment/customerinfo - the Owner is the payer and the billing email is theirs", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `payer` is the only thing in the whole API that separates the Payer's banner
    // from the one every other admin sees, and the only thing that says where the
    // low-balance letter goes. Asserting it is defined — which is all the existing
    // customerinfo tests do — would pass with the wrong person in it.
    const ownerApi = apiSdk.forRole("owner");
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(LOW_AMOUNT);

    const { data: self } = await ownerApi.profiles.getSelfProfile();
    const ownerId = self.response?.id;
    expect(ownerId, "the owner's own id").toBeDefined();

    const { data, status } = await ownerApi.payment.getCustomerInfo();

    expect(status).toBe(200);
    expect(data.response?.payer?.id).toBe(ownerId);
    expect(data.response?.payer?.displayName).toBeTruthy();
    expect(data.response?.email).toBe(config.DOCSPACE_OWNER_EMAIL);
  });

  test("GET /api/2.0/portal/payment/customerinfo - DocSpaceAdmin is not the payer and sees the Owner instead", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await paymentsApi.makeWalletTopUp(LOW_AMOUNT);

    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerSelf } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerSelf.response?.id;
    expect(ownerId, "the owner's own id").toBeDefined();

    const { data: created } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = created.response?.id;
    expect(adminId, "the admin's id").toBeDefined();

    const adminApi = apiSdk.forRole("docSpaceAdmin");

    // The premise the conclusion rests on: this really is the admin's request and
    // not the owner's leaking through the shared cookie. Without it, "the payer is
    // someone else" would be trivially true.
    const { data: adminSelf } = await adminApi.profiles.getSelfProfile();
    expect(adminSelf.response?.id, "the request is acting as the admin").toBe(
      adminId,
    );
    expect(adminId).not.toBe(ownerId);

    const { data, status } = await adminApi.payment.getCustomerInfo();

    expect(status).toBe(200);
    expect(data.response?.payer?.id).toBe(ownerId);
    expect(data.response?.payer?.id).not.toBe(adminId);
  });
});

test.describe("POST /api/2.0/portal/payment/topupsettings - auto top-up bounds", () => {
  // Auto top-up is the API side of "prevent interruption of paid services": it is
  // what keeps a portal from ever reaching the balance the banner warns about.
  // Only the happy value (100/1000) was covered; `TenantWalletSettings` documents
  // minBalance as 5..1000 and upToBalance as 6..5000, and a limit nobody checks is
  // a limit the client can be talked out of.
  test("POST /api/2.0/portal/payment/topupsettings - Owner sets the documented minimum trigger", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: { enabled: true, minBalance: 5, upToBalance: 6 },
      },
    });
    expect(status).toBe(200);

    const settings = await getWalletTopUpSettings(ownerApi.payment);
    expect(settings?.enabled).toBe(true);
    expect(settings?.minBalance).toBe(5);
    expect(settings?.upToBalance).toBe(6);
  });

  test("POST /api/2.0/portal/payment/topupsettings - Owner sets the documented maximum trigger", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: { enabled: true, minBalance: 1000, upToBalance: 5000 },
      },
    });
    expect(status).toBe(200);

    const settings = await getWalletTopUpSettings(ownerApi.payment);
    expect(settings?.minBalance).toBe(1000);
    expect(settings?.upToBalance).toBe(5000);
  });

  test("POST /api/2.0/portal/payment/topupsettings - Owner cannot set a trigger below the documented minimum", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    const ownerApi = apiSdk.forRole("owner");

    // A known-good value first, so the read-back below proves the rejected call
    // changed nothing rather than merely finding an empty setting.
    await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: { enabled: true, minBalance: 100, upToBalance: 1000 },
      },
    });

    const { status } = await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: { enabled: true, minBalance: 4, upToBalance: 1000 },
      },
    });
    expect(status).toBe(400);

    const settings = await getWalletTopUpSettings(ownerApi.payment);
    expect(settings?.minBalance).toBe(100);
  });

  test("BUG XXXXX: POST /api/2.0/portal/payment/topupsettings - Owner cannot top up to less than the trigger", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `minBalance` below its documented minimum is rejected with a 400 (the test
    // above), but the *relationship* between the two bounds is not checked at all:
    // an upper bound under the trigger is stored, leaving auto top-up configured to
    // refill the wallet into a state that immediately triggers another refill.
    test.fail(
      true,
      "BUG XXXXX: topupsettings accepts upToBalance below minBalance",
    );

    await paymentsApi.makeWalletTopUp();
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: { enabled: true, minBalance: 100, upToBalance: 1000 },
      },
    });

    const { status } = await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: { enabled: true, minBalance: 100, upToBalance: 50 },
      },
    });

    // The stored value first: what makes this a bug is that the nonsensical pair
    // is kept, not the status code by itself.
    const settings = await getWalletTopUpSettings(ownerApi.payment);
    expect(settings?.upToBalance).toBe(1000);
    expect(status).toBe(400);
  });

  test("POST /api/2.0/portal/payment/topupsettings - auto top-up settings survive a low balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The two halves of the requirement in one place: the portal is under the
    // threshold *and* configured to refill itself. The settings are per tenant and
    // must read back the same whichever state the wallet is in.
    const ownerApi = apiSdk.forRole("owner");

    await fundWalletBelowThreshold(paymentsApi, ownerApi.payment, LOW_AMOUNT);

    const { status } = await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: { enabled: true, minBalance: 5, upToBalance: 20 },
      },
    });
    expect(status).toBe(200);

    const settings = await getWalletTopUpSettings(ownerApi.payment);
    expect(settings?.enabled).toBe(true);
    expect(settings?.minBalance).toBe(5);
    expect(settings?.upToBalance).toBe(20);
    expect(settings?.lastModified).toBeDefined();

    // Configuring a refill is not itself a refill: the portal is still under the
    // threshold, and the banner is still the correct thing to show.
    expect(await getWalletBalance(ownerApi.payment)).toBeLessThan(
      LOW_BALANCE_THRESHOLD,
    );
  });

  test("POST /api/2.0/portal/payment/topupsettings - the auto top-up amounts are stored with a currency", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `minBalance`/`upToBalance` are amounts of money, and `TenantWalletSettings`
    // carries a `currency` for them. Two portals with different wallet currencies
    // would otherwise be told to refill at "5" of nothing in particular.
    await paymentsApi.makeWalletTopUp();
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: {
          enabled: true,
          minBalance: 5,
          upToBalance: 20,
          currency: "USD",
        },
      },
    });
    expect(status).toBe(200);

    const settings = await getWalletTopUpSettings(ownerApi.payment);
    expect(settings?.minBalance).toBe(5);
    expect(settings?.currency).toBe("USD");
  });
});

test.describe("GET /api/2.0/portal/payment/subscription/balance", () => {
  test("GET /api/2.0/portal/payment/subscription/balance - a wallet portal with no subscription is answered 402", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The other advertised way out of a low balance: the unused part of the current
    // subscription period, which `POST subscription/movetowallet` can push into the
    // wallet. The route had no coverage at all, and what it actually answers on a
    // test portal is 402 — `setupPayment` marks the portal paid through the
    // payments sandbox but never creates the Stripe subscription this reads, the
    // same reason `topUpDeposit` and `updatePayment` come back inert here. So the
    // populated `SubscriptionBalanceInfo` body cannot be reached from test code;
    // what is pinned instead is that a portal with no subscription is refused
    // rather than handed a zeroed-out balance that the client would offer to move.
    //
    // The owner is used because this route is payer-only: it demands the payer
    // rather than an administrator, so even a DocSpaceAdmin is refused (403) and a
    // portal with no billing customer yet is 404. Both are in
    // payments.permissions.spec.ts.
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } =
      await ownerApi.payment.getSubscriptionBalanceInfo();

    expect(status).toBe(402);
    expect(data.response).toBeUndefined();
  });
});
