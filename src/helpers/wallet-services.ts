import { expect } from "@playwright/test";
import {
  TenantWalletService,
  PaymentApi,
  PaymentApiChangeTenantWalletServiceStateRequest,
} from "@onlyoffice/docspace-api-sdk";
import { PaymentApi as PortalPaymentApi } from "@/src/services/payment-api";
import { AiAccessClient, setPortalAiAccess } from "./ai-access";

export const walletServices = {
  aiTools: TenantWalletService.AITools,
  backup: TenantWalletService.Backup,
  storage: TenantWalletService.Storage,
} as const;

export type WalletServiceName = keyof typeof walletServices;

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

/** Whether the portal currently has this wallet service in its enabled list. */
export async function isWalletServiceEnabled(
  paymentApi: Pick<PaymentApi, "getTenantWalletServiceSettings">,
  service: WalletServiceName,
): Promise<boolean> {
  const { data, status } = await paymentApi.getTenantWalletServiceSettings();
  expect(status, "GET /portal/payment/walletservices/settings").toBe(200);
  return (data.response?.enabledServices ?? []).includes(
    walletServices[service],
  );
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
