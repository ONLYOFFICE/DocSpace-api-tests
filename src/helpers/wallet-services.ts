import { expect } from "@playwright/test";
import {
  TenantWalletService,
  PaymentApi,
  PaymentApiChangeTenantWalletServiceStateRequest,
  CustomerServiceUsageDto,
  OperationDto,
  TenantWalletSettings,
} from "@onlyoffice/docspace-api-sdk";
import { PaymentApi as PortalPaymentApi } from "@/src/services/payment-api";
import { AiAccessClient, setPortalAiAccess } from "./ai-access";

export const walletServices = {
  aiTools: TenantWalletService.AITools,
  /**
   * The "AI search" add-on in Billing → Add-ons. This, and nothing on
   * `/ai/web-search/*`, is how web search is switched on: enabling it configures
   * the portal's own ONLYOFFICE provider and the searches are billed to the
   * wallet. No Exa key is involved. See ai-web-search.ts.
   */
  aiSearch: TenantWalletService.AISearch,
  backup: TenantWalletService.Backup,
  storage: TenantWalletService.Storage,
} as const;

export type WalletServiceName = keyof typeof walletServices;

/**
 * How the accounting service spells each wallet service. These are the values
 * `serviceName` filters take on `customer/operations` and `customer/usage`, and
 * the values that come back in `OperationDto.service` — the catalogue's
 * `serviceName`, not the `TenantWalletService` id.
 */
export const walletServiceNames = {
  aiTools: "ai-tools",
  aiSearch: "ai-search",
  backup: "backup",
  storage: "disk-storage-1-hour",
} as const satisfies Record<WalletServiceName, string>;

export async function topUpDeposit(
  paymentApi: Pick<PaymentApi, "topUpDeposit">,
  amount: number,
  currency = "USD",
) {
  return paymentApi.topUpDeposit({
    topUpDepositRequestDto: { amount, currency },
  });
}

export async function creditAiBalance(
  paymentApi: Pick<PaymentApi, "creditAiBalance">,
  amount: number,
  currency = "USD",
) {
  return paymentApi.creditAiBalance({
    creditAiBalanceRequestDto: { amount, currency },
  });
}

export async function enableWalletService(
  paymentApi: Pick<PaymentApi, "changeTenantWalletServiceState">,
  service: WalletServiceName,
) {
  return paymentApi.changeTenantWalletServiceState({
    changeWalletServiceStateRequestDto: {
      service: walletServices[service],
      enabled: true,
    },
  } as PaymentApiChangeTenantWalletServiceStateRequest);
}

/**
 * Provisions a portal so AI features backed by the configured "ONLYOFFICE AI"
 * gateway can be used: sets up payment, registers the wallet billing customer
 * and enables the AI Tools wallet service. Without this, creating an agent/chat
 * against the gateway provider (providerId -1) returns 400 "ProviderId", and
 * inference fails with "Customer account not found".
 *
 * NOTE: this covers the portal/billing side only. Actual inference also depends
 * on the gateway's upstream OpenRouter account having credits — when it runs
 * out, startNewChat streams `HTTP 402 upstream_error: Insufficient credits`,
 * which cannot be fixed from test code.
 */
export async function enableAiGateway(
  paymentsApi: Pick<PortalPaymentApi, "setupPayment" | "makeWalletTopUp">,
  payment: Pick<
    PaymentApi,
    "changeTenantWalletServiceState" | "creditAiBalance"
  >,
) {
  await paymentsApi.setupPayment();
  // general wallet / tenant deposit
  await paymentsApi.makeWalletTopUp(1000);
  // enable the AI Tools wallet service
  await enableWalletService(payment, "aiTools");
  // fund the AI balance separately
  await creditAiBalance(payment, 1000);
}

export async function disableWalletService(
  paymentApi: Pick<PaymentApi, "changeTenantWalletServiceState">,
  service: WalletServiceName,
) {
  return paymentApi.changeTenantWalletServiceState({
    changeWalletServiceStateRequestDto: {
      service: walletServices[service],
      enabled: false,
    },
  } as PaymentApiChangeTenantWalletServiceStateRequest);
}

/**
 * Same as `enableAiGateway` minus `creditAiBalance`: the portal pays for the AI
 * Tools wallet service but never gets any AI credit. That is a third portal
 * state, distinct from the unpaid one, and inference is expected to work in it.
 *
 * The AI balance itself cannot be read back — `GET
 * /portal/payment/customer/aibalance` answers 403 "Accounting client does not
 * support sub-accounts" on these portals — so "zero credit" is established by
 * never crediting it, not by asserting a balance of 0. What is asserted is the
 * part that is observable: AI Tools really is in the enabled-services list.
 */
export async function enableAiToolsWithoutAiCredit(
  paymentsApi: Pick<PortalPaymentApi, "setupPayment" | "makeWalletTopUp">,
  payment: Pick<
    PaymentApi,
    "changeTenantWalletServiceState" | "getTenantWalletServiceSettings"
  >,
) {
  await paymentsApi.setupPayment();
  await paymentsApi.makeWalletTopUp(1000);
  await enableWalletService(payment, "aiTools");

  expect(
    await isWalletServiceEnabled(payment, "aiTools"),
    "AI Tools in the portal's enabled wallet services after enabling it",
  ).toBe(true);
}

/**
 * Switches the AI search add-on on or off and proves the portal really is in
 * that state — everything about web search hangs off this one flag, so a test
 * that assumed it instead of asserting it would report on the wrong portal.
 */
export async function setAiSearchAddon(
  paymentApi: Pick<
    PaymentApi,
    "changeTenantWalletServiceState" | "getTenantWalletServiceSettings"
  >,
  enabled: boolean,
): Promise<void> {
  const { status } = enabled
    ? await enableWalletService(paymentApi, "aiSearch")
    : await disableWalletService(paymentApi, "aiSearch");
  expect(status, `POST /portal/payment/servicestate AISearch=${enabled}`).toBe(
    200,
  );

  expect(
    await isWalletServiceEnabled(paymentApi, "aiSearch"),
    `AI search in the portal's enabled wallet services after setting it to ${enabled}`,
  ).toBe(enabled);
}

/**
 * The balance at which the client starts showing its low-balance banners, in the
 * wallet currency.
 *
 * This number lives in the client, not in the API: nothing on
 * `/portal/payment/*` returns a threshold, a "low balance" flag or an audit
 * event for the banner (the wallet actions are only `CustomerWalletToppedUp`,
 * `CustomerOperationPerformed` and the two settings ones). So the banner itself
 * is not API-testable — what is testable is the number it reads, who it can be
 * read by, and whether paid services actually keep working below it. That is
 * what the tests using this constant cover.
 */
export const LOW_BALANCE_THRESHOLD = 1;

/**
 * The portal's wallet balance in its own account currency.
 *
 * `subAccounts` is a per-currency list, so the account currency's row is the one
 * to read — taking `[0]` would silently report another currency's amount if the
 * order ever changes.
 */
export async function getWalletBalance(
  paymentApi: Pick<PaymentApi, "getCustomerBalance">,
): Promise<number> {
  const { data, status } = await paymentApi.getCustomerBalance();
  expect(status, "GET /portal/payment/customer/balance").toBe(200);

  const currency = data.response?.accountCurrency;
  const subAccounts = data.response?.subAccounts ?? [];
  const account =
    subAccounts.find((sub) => sub.currency === currency) ?? subAccounts[0];

  expect(
    account?.amount,
    `GET /portal/payment/customer/balance returned no ${currency} sub-account`,
  ).toBeDefined();
  return account!.amount!;
}

/**
 * Puts the portal into the low-balance state: paid, with a wallet holding less
 * than `LOW_BALANCE_THRESHOLD` but more than nothing.
 *
 * The only lever for this is the same `setwallettopup` hook every other payment
 * test uses — `topUpDeposit` goes through Stripe and is inert on test portals,
 * and spending a balance down is not an option because the per-operation charges
 * are fractions of a cent. A fresh portal starts with an empty wallet, so a
 * sub-$1 top-up lands the portal under the threshold whether the hook sets the
 * balance or adds to it.
 *
 * The resulting balance is asserted rather than assumed: if a portal ever starts
 * out with a bonus, or the hook stops honouring fractional sums, every test
 * built on this would otherwise quietly start proving something about a
 * perfectly funded portal instead.
 */
export async function fundWalletBelowThreshold(
  paymentsApi: Pick<PortalPaymentApi, "setupPayment" | "makeWalletTopUp">,
  paymentApi: Pick<PaymentApi, "getCustomerBalance">,
  amount = 0.5,
): Promise<number> {
  expect(
    amount,
    "the funded amount has to be under the low-balance threshold",
  ).toBeLessThan(LOW_BALANCE_THRESHOLD);

  await paymentsApi.setupPayment();
  await paymentsApi.makeWalletTopUp(amount);

  const balance = await getWalletBalance(paymentApi);
  expect(
    balance,
    "wallet balance after a sub-threshold top-up",
  ).toBeGreaterThan(0);
  expect(balance, "wallet balance after a sub-threshold top-up").toBeLessThan(
    LOW_BALANCE_THRESHOLD,
  );

  return balance;
}

/**
 * The portal's wallet auto top-up settings.
 *
 * The SDK types this read as `{ settings }`, but the portal answers the usual
 * `{ response }` envelope — hence the cast, which is why every caller would
 * otherwise repeat an `as any`.
 */
export async function getWalletTopUpSettings(
  paymentApi: Pick<PaymentApi, "getTenantWalletSettings">,
): Promise<TenantWalletSettings | undefined> {
  const { data, status } = await paymentApi.getTenantWalletSettings();
  expect(status, "GET /portal/payment/topupsettings").toBe(200);
  return (data as unknown as { response?: TenantWalletSettings }).response;
}

/**
 * The low-balance state with AI Tools paid for on top of it — the state a portal
 * is in when the banner is up and the user keeps using AI. Deliberately does not
 * credit the AI balance: this has to stay distinguishable from the funded portal
 * `enableAiGateway` builds, and from the unpaid one `configureAiToolsAsUnpaid`
 * builds.
 */
export async function enableAiToolsWithLowBalance(
  paymentsApi: Pick<PortalPaymentApi, "setupPayment" | "makeWalletTopUp">,
  paymentApi: Pick<
    PaymentApi,
    | "changeTenantWalletServiceState"
    | "getTenantWalletServiceSettings"
    | "getCustomerBalance"
  >,
  amount = 0.5,
): Promise<number> {
  await fundWalletBelowThreshold(paymentsApi, paymentApi, amount);

  await enableWalletService(paymentApi, "aiTools");
  expect(
    await isWalletServiceEnabled(paymentApi, "aiTools"),
    "AI Tools in the portal's enabled wallet services",
  ).toBe(true);

  // Re-read: enabling a wallet service is itself a billable change, and the
  // point of this state is that the balance is still under the threshold.
  const afterEnabling = await getWalletBalance(paymentApi);
  expect(afterEnabling, "wallet balance after enabling AI Tools").toBeLessThan(
    LOW_BALANCE_THRESHOLD,
  );

  return afterEnabling;
}

/**
 * The period both accounting routes want. They are period queries, and a call
 * without one is a different question from "what has this portal been charged
 * for today", so every helper here asks the same explicit window.
 */
export function accountingPeriod(days = 30) {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(now);
  endDate.setHours(23, 59, 59, 0);

  return {
    startDate: startDate.toISOString().slice(0, 19),
    endDate: endDate.toISOString().slice(0, 19),
  };
}

/**
 * The accounting service's aggregate row for one wallet service, or `undefined`
 * when it has never been billed on this portal. This is the per-service side of
 * the wallet: what proves an add-on is charged as a service of its own rather
 * than folded into another one's total.
 */
export async function getServiceUsage(
  paymentApi: Pick<PaymentApi, "getCustomerServiceUsage">,
  service: WalletServiceName,
): Promise<CustomerServiceUsageDto | undefined> {
  const serviceName = walletServiceNames[service];
  const { data, status } = await paymentApi.getCustomerServiceUsage({
    serviceName: [serviceName],
    ...accountingPeriod(),
  });

  expect(status, `GET /portal/payment/customer/usage ${serviceName}`).toBe(200);
  return (data.response?.collection ?? []).find(
    (row) => row.service === serviceName,
  );
}

/** Every operation billed to one wallet service in the last 30 days. */
export async function getServiceOperations(
  paymentApi: Pick<PaymentApi, "getCustomerOperations">,
  service: WalletServiceName,
): Promise<OperationDto[]> {
  const serviceName = walletServiceNames[service];
  const { data, status } = await paymentApi.getCustomerOperations({
    offset: 0,
    limit: 100,
    serviceName: [serviceName],
    credit: true,
    debit: true,
    ...accountingPeriod(),
  });

  expect(status, `GET /portal/payment/customer/operations ${serviceName}`).toBe(
    200,
  );
  return data.response?.collection ?? [];
}

/**
 * When an operation was booked.
 *
 * The SDK types `date` as `ApiDateTime`, but the accounting service sends a bare
 * ISO string (`"2026-08-19T10:02:26.5444310+01:00"`), so `date.utcTime` is
 * always undefined — which quietly dropped the timestamp out of `operationKey`
 * and let two charges of the same size collide.
 */
export function operationDate(operation: OperationDto): string | undefined {
  const date = operation.date as unknown;
  return typeof date === "string" ? date : operation.date?.utcTime;
}

/**
 * Identity of one billed operation. `OperationDto` carries no id, so the
 * baseline for "a new charge appeared" is this tuple — the fields the
 * accounting service varies per operation. Comparing counts instead would pass
 * on any unrelated charge landing in the same window.
 */
export function operationKey(operation: OperationDto): string {
  return [
    operationDate(operation),
    operation.service,
    operation.description,
    operation.details,
    operation.quantity,
    operation.debit,
    operation.credit,
    operation.agentId,
  ].join("|");
}

/**
 * Waits for a charge to land on one wallet service that was not in `seen` *and*
 * that `matches`.
 *
 * The predicate is not a convenience: one AI action can produce several charges
 * (a chat inside an agent with a filled Knowledge folder bills the answer and the
 * embedding of the question), so "the first row I have not seen" is not
 * necessarily the row the test is about. Match on `description` when it matters
 * which feature was billed.
 */
export async function waitForMatchingServiceOperation(
  paymentApi: Pick<PaymentApi, "getCustomerOperations">,
  service: WalletServiceName,
  seen: Set<string>,
  matches: (operation: OperationDto) => boolean,
  timeoutMs = 120000,
): Promise<OperationDto | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const operations = await getServiceOperations(paymentApi, service);
    const fresh = operations.find(
      (operation) => !seen.has(operationKey(operation)) && matches(operation),
    );
    if (fresh || Date.now() > deadline) return fresh;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

/**
 * Waits for a charge to land on one wallet service that was not in `seen`.
 * Billing is written asynchronously, well after the API call that caused it has
 * answered, so a single read right afterwards is a false negative. Returns
 * `undefined` on timeout — the caller decides whether that is the expected
 * outcome, so this can serve an absence check too.
 */
export async function waitForServiceOperation(
  paymentApi: Pick<PaymentApi, "getCustomerOperations">,
  service: WalletServiceName,
  seen: Set<string>,
  timeoutMs = 120000,
): Promise<OperationDto | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const operations = await getServiceOperations(paymentApi, service);
    const fresh = operations.find(
      (operation) => !seen.has(operationKey(operation)),
    );
    if (fresh || Date.now() > deadline) return fresh;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

/**
 * Everything the portal currently pays for, read in one call. Use this instead
 * of two `isWalletServiceEnabled` calls whenever a test is about *which*
 * services a single write touched: two reads can straddle a change, and an
 * assertion on one service alone passes on a portal that also flipped another.
 */
export async function getEnabledWalletServices(
  paymentApi: Pick<PaymentApi, "getTenantWalletServiceSettings">,
): Promise<TenantWalletService[]> {
  const { data, status } = await paymentApi.getTenantWalletServiceSettings();
  expect(status, "GET /portal/payment/walletservices/settings").toBe(200);
  return data.response?.enabledServices ?? [];
}

/** Whether the portal currently has this wallet service in its enabled list. */
export async function isWalletServiceEnabled(
  paymentApi: Pick<PaymentApi, "getTenantWalletServiceSettings">,
  service: WalletServiceName,
): Promise<boolean> {
  return (await getEnabledWalletServices(paymentApi)).includes(
    walletServices[service],
  );
}

/**
 * The 403 the accounting service answers when the AI search add-on is bought
 * while AI Tools is off. This exact text is the API side of the dependency
 * dialog: it is what tells a client to offer "enable both" rather than report a
 * plain access failure, so it is pinned as a string, not as a status code.
 */
export const AI_SEARCH_DEPENDENCY_MESSAGE =
  "AI Tools service must be enabled before Search";

/** The message body `servicestate` returns on a refusal. */
export function walletServiceErrorMessage(data: unknown): string | undefined {
  return (data as { error?: { message?: string } } | undefined)?.error?.message;
}

/**
 * Puts the portal into the "AI is switched on but AI Tools was never paid for"
 * state, and proves it is really in it.
 *
 * A fresh test portal happens to start unpaid, but a test that relies on that
 * default silently changes meaning if the default ever does — so the state is
 * asserted here, and AI Tools is switched off if it turns out to be on. The
 * portal AI switch is turned ON on purpose: with it off the portal would be in
 * the *other* off-state and nothing about the wallet would be proved.
 *
 * Note that a portal with no billing customer cannot be switched off explicitly
 * (`changeTenantWalletServiceState` answers 404 "Customer could not be found"
 * before any payment), which is why the disable call is conditional.
 */
export async function configureAiToolsAsUnpaid(
  ownerApi: AiAccessClient & {
    payment: Pick<
      PaymentApi,
      "changeTenantWalletServiceState" | "getTenantWalletServiceSettings"
    >;
  },
): Promise<void> {
  const ai = await setPortalAiAccess(ownerApi, true);
  expect(ai.writeStatus, "PUT /settings/ai-access {enabled:true}").toBe(200);
  expect(ai.enabled, "ai-access read back before the wallet check").toBe(true);

  if (await isWalletServiceEnabled(ownerApi.payment, "aiTools")) {
    await disableWalletService(ownerApi.payment, "aiTools");
  }

  expect(
    await isWalletServiceEnabled(ownerApi.payment, "aiTools"),
    "AI Tools must be absent from the portal's enabled wallet services",
  ).toBe(false);
}
