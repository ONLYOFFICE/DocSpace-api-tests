import {
  TenantWalletService,
  PaymentApi,
  PaymentApiChangeTenantWalletServiceStateRequest,
} from "@onlyoffice/docspace-api-sdk";

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
