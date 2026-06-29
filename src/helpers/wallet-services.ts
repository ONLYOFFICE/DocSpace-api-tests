import {
  TenantWalletService,
  PaymentApi,
  PaymentApiChangeTenantWalletServiceStateRequest,
} from "@onlyoffice/docspace-api-sdk";
import { PaymentApi as PortalPaymentApi } from "@/src/services/payment-api";

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
