import {
  TenantWalletService,
  PaymentApi,
  PaymentApiChangeTenantWalletServiceStateRequest,
} from "@onlyoffice/docspace-api-sdk";

export const walletServices = {
  aiTools: TenantWalletService.AITools,
  backup: TenantWalletService.Backup,
  storage: TenantWalletService.Storage,
  webSearch: TenantWalletService.WebSearch,
} as const;

export type WalletServiceName = keyof typeof walletServices;

export const walletServiceNames: Record<WalletServiceName, string> = {
  aiTools: "ai-tools",
  backup: "backup",
  storage: "storage",
  webSearch: "web-search",
};

export async function topUpDeposit(
  paymentApi: Pick<PaymentApi, "topUpDeposit">,
  amount: number,
  currency = "USD",
) {
  return paymentApi.topUpDeposit({
    topUpDepositRequestDto: { amount, currency },
  });
}

export async function buyWalletService(
  paymentApi: Pick<PaymentApi, "buyWalletService">,
  service: WalletServiceName,
  quantity: number,
) {
  return paymentApi.buyWalletService({
    buyWalletServiceRequestDto: {
      quantity,
      serviceName: walletServiceNames[service],
    },
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
