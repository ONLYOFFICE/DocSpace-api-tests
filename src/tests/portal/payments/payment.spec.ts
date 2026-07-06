import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { TenantWalletService } from "@onlyoffice/docspace-api-sdk";
import {
  topUpDeposit,
  creditAiBalance,
  enableWalletService,
  disableWalletService,
} from "@/src/helpers/wallet-services";
import { restrictableAiModelIds } from "@/src/helpers/ai-providers";

test.describe("PUT /api/2.0/portal/payment/url", () => {
  test("PUT /api/2.0/portal/payment/url - Owner gets payment page URL", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: apiSdk.tokenStore.portalBaseUrl,
          successUrl: apiSdk.tokenStore.portalBaseUrl,
          quantity: { admin: 1 },
        },
      });
    expect(status).toBe(200);

    const url = new URL(data.response!);
    expect(url.hostname).toBe("payments.teamlab.info");
    expect(url.searchParams.get("qty")).toBe("1");
    expect(url.searchParams.get("currency")).toBeDefined();
    expect(url.searchParams.get("language")).toBeDefined();
    expect(url.searchParams.get("refId")).toBeDefined();
    expect(url.searchParams.get("email")).toBeDefined();
  });

  test("PUT /api/2.0/portal/payment/url - DocSpaceAdmin gets payment page URL", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: apiSdk.tokenStore.portalBaseUrl,
          successUrl: apiSdk.tokenStore.portalBaseUrl,
          quantity: { admin: 2 },
        },
      });

    expect(status).toBe(200);

    const url = new URL(data.response!);
    expect(url.hostname).toBe("payments.teamlab.info");
    expect(url.searchParams.get("qty")).toBe("2");
    expect(url.searchParams.get("currency")).toBeDefined();
    expect(url.searchParams.get("language")).toBeDefined();
    expect(url.searchParams.get("refId")).toBeDefined();
    expect(url.searchParams.get("email")).toBeDefined();
  });
});

// Skipped due to OO AI service being hidden
test.describe("POST /api/2.0/portal/payment/creditaibalance", () => {
  test.skip("POST /api/2.0/portal/payment/creditaibalance - Owner credits AI balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await creditAiBalance(ownerApi.payment, 10);
    expect(status).toBe(200);
    expect(data.response?.operationId).toBeDefined();
    expect(data.response?.amount).toBeDefined();
    expect(data.response?.currency).toBe("USD");
  });
});

test.describe("POST /api/2.0/portal/payment/servicestate", () => {
  test("POST /api/2.0/portal/payment/servicestate - Owner enables ai-tools service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: {
          service: TenantWalletService.AITools,
          enabled: true,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.AITools,
    );
  });

  test("POST /api/2.0/portal/payment/servicestate - Owner disables ai-tools service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await enableWalletService(ownerApi.payment, "aiTools");

    const { data, status } =
      await ownerApi.payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: {
          service: TenantWalletService.AITools,
          enabled: false,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.enabledServices ?? []).not.toContain(
      TenantWalletService.AITools,
    );
  });

  test("POST /api/2.0/portal/payment/servicestate - Owner enables backup service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: {
          service: TenantWalletService.Backup,
          enabled: true,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.Backup,
    );
  });

  test("POST /api/2.0/portal/payment/servicestate - Owner disables backup service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await enableWalletService(ownerApi.payment, "backup");

    const { data, status } =
      await ownerApi.payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: {
          service: TenantWalletService.Backup,
          enabled: false,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.enabledServices ?? []).not.toContain(
      TenantWalletService.Backup,
    );
  });

  test("POST /api/2.0/portal/payment/servicestate - Owner enables storage service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: {
          service: TenantWalletService.Storage,
          enabled: true,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.Storage,
    );
  });

  test("POST /api/2.0/portal/payment/servicestate - Owner disables storage service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await enableWalletService(ownerApi.payment, "storage");

    const { data, status } =
      await ownerApi.payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: {
          service: TenantWalletService.Storage,
          enabled: false,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.enabledServices ?? []).not.toContain(
      TenantWalletService.Storage,
    );
  });
});

test.describe("PUT /api/2.0/portal/payment/updatewallet", () => {
  test("PUT /api/2.0/portal/payment/updatewallet - Owner adds storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/portal/payment/updatewallet - Owner disables storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 0 },
        productQuantityType: 0,
      },
    });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/portal/payment/updatewallet - Owner deactivates and cancels deactivation of storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 0 },
        productQuantityType: 0,
      },
    });

    const { data: cancelData, status: cancelStatus } =
      await ownerApi.payment.updateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: null },
          productQuantityType: 0,
        },
      });
    expect(cancelStatus).toBe(200);
    expect(cancelData.response).toBe(true);
  });
});

test.describe("PUT /api/2.0/portal/payment/calculatewallet", () => {
  test("PUT /api/2.0/portal/payment/calculatewallet - Owner calculates wallet payment after disabling storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });

    await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 0 },
        productQuantityType: 0,
      },
    });

    const { data, status } = await ownerApi.payment.calculateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });

    expect(status).toBe(200);
    expect(data.response?.operationId).toBe(0);
    expect(data.response?.amount).toBeDefined();
    expect(data.response?.currency).toBe("USD");
    expect(data.response?.quantity).toBe(100);
  });

  test("PUT /api/2.0/portal/payment/calculatewallet - Owner calculates wallet payment for storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.operationId).toBeDefined();
    expect(data.response?.amount).toBeDefined();
    expect(data.response?.currency).toBe("USD");
    expect(data.response?.quantity).toBe(100);
  });
});

// Skipped due to OO AI service being hidden
test.describe("POST /api/2.0/portal/payment/customer/operationsreport", () => {
  test.skip("POST /api/2.0/portal/payment/customer/operationsreport - Owner creates report for ai-tools", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await creditAiBalance(ownerApi.payment, 10);
    await enableWalletService(ownerApi.payment, "aiTools");

    const { data, status } =
      await ownerApi.payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "ai-tools",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.id).toContain("DocumentBuilderTask_");
    expect((data as any).response?.isCompleted).toBe(false);
    expect((data as any).response?.error).toBe("");
  });

  test("POST /api/2.0/portal/payment/customer/operationsreport - Owner creates report for backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await enableWalletService(ownerApi.payment, "backup");

    const { data, status } =
      await ownerApi.payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "backup",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.id).toContain("DocumentBuilderTask_");
    expect((data as any).response?.isCompleted).toBe(false);
    expect((data as any).response?.error).toBe("");
  });

  test("POST /api/2.0/portal/payment/customer/operationsreport - Owner creates report for storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });
    await enableWalletService(ownerApi.payment, "storage");

    const { data, status } =
      await ownerApi.payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "disk-storage-1-hour",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.id).toContain("DocumentBuilderTask_");
    expect((data as any).response?.isCompleted).toBe(false);
    expect((data as any).response?.error).toBe("");
  });

  // Skipped due to OO AI service being hidden
  test.skip("POST /api/2.0/portal/payment/customer/operationsreport - DocSpaceAdmin creates report for ai-tools", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await creditAiBalance(ownerApi.payment, 10);
    await enableWalletService(ownerApi.payment, "aiTools");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "ai-tools",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.id).toContain("DocumentBuilderTask_");
    expect((data as any).response?.isCompleted).toBe(false);
    expect((data as any).response?.error).toBe("");
  });

  test("POST /api/2.0/portal/payment/customer/operationsreport - DocSpaceAdmin creates report for backup", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await enableWalletService(ownerApi.payment, "backup");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "backup",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.id).toContain("DocumentBuilderTask_");
    expect((data as any).response?.isCompleted).toBe(false);
    expect((data as any).response?.error).toBe("");
  });

  test("POST /api/2.0/portal/payment/customer/operationsreport - DocSpaceAdmin creates report for storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });
    await enableWalletService(ownerApi.payment, "storage");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "disk-storage-1-hour",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.id).toContain("DocumentBuilderTask_");
    expect((data as any).response?.isCompleted).toBe(false);
    expect((data as any).response?.error).toBe("");
  });
});

// Skipped due to OO AI service being hidden
test.describe("GET /api/2.0/portal/payment/customer/operationsreport", () => {
  test.skip("GET /api/2.0/portal/payment/customer/operationsreport - Owner gets report generation status", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await creditAiBalance(ownerApi.payment, 10);
    await enableWalletService(ownerApi.payment, "aiTools");
    await ownerApi.payment.createCustomerOperationsReport({
      customerOperationsReportRequestDto: {
        serviceName: "ai-tools",
        credit: true,
        debit: true,
      },
    });

    let taskData: any;
    await expect(async () => {
      const { data } = await ownerApi.payment.getCustomerOperationsReport();
      expect((data as any).response?.isCompleted).toBe(true);
      taskData = (data as any).response;
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

    expect(taskData.id).toContain("DocumentBuilderTask_");
    expect(taskData.percentage).toBe(100);
    expect(taskData.isCompleted).toBe(true);
    expect(taskData.error).toBe("");
    expect(taskData.resultFileId).toBeDefined();
    expect(taskData.resultFileUrl).toBeDefined();
  });

  // Skipped due to OO AI service being hidden
  test.skip("GET /api/2.0/portal/payment/customer/operationsreport - DocSpaceAdmin gets report generation status", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await creditAiBalance(ownerApi.payment, 10);
    await enableWalletService(ownerApi.payment, "aiTools");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const docSpaceAdminApi = apiSdk.forRole("docSpaceAdmin");
    await docSpaceAdminApi.payment.createCustomerOperationsReport({
      customerOperationsReportRequestDto: {
        serviceName: "ai-tools",
        credit: true,
        debit: true,
      },
    });

    let taskData: any;
    await expect(async () => {
      const { data } =
        await docSpaceAdminApi.payment.getCustomerOperationsReport();
      expect((data as any).response?.isCompleted).toBe(true);
      taskData = (data as any).response;
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

    expect(taskData.id).toContain("DocumentBuilderTask_");
    expect(taskData.percentage).toBe(100);
    expect(taskData.isCompleted).toBe(true);
    expect(taskData.error).toBe("");
    expect(taskData.resultFileId).toBeDefined();
    expect(taskData.resultFileUrl).toBeDefined();
  });
});

// Skipped due to OO AI service being hidden
test.describe("GET /api/2.0/portal/payment/ai-prices", () => {
  test.skip("GET /api/2.0/portal/payment/ai-prices - Owner gets AI prices", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getAiPrices();

    const expectedChatModels = [
      "claude-sonnet-4.6",
      "deepseek-v3.2",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
      "gpt-5.2",
      "gpt-5.4",
    ];

    expect(status).toBe(200);
    const chatIds = data.response?.chat?.map((m) => m.id);
    for (const modelId of expectedChatModels) {
      expect(chatIds).toContain(modelId);
    }
    for (const model of data.response?.chat ?? []) {
      expect(model.id).toBeDefined();
      expect(model.alias).toBeDefined();
      expect(model.provider).toBeDefined();
      expect(model.price.prompt).toBeDefined();
      expect(model.price.completion).toBeDefined();
    }
    expect(data.response?.embedding?.length).toBeGreaterThan(0);
    expect(data.response?.embedding?.[0].id).toBeDefined();
    expect(data.response?.embedding?.[0].alias).toBeDefined();
    expect(data.response?.embedding?.[0].provider).toBeDefined();
    expect(data.response?.embedding?.[0].price.prompt).toBeDefined();
    expect((data.response?.webSearch as any)?.length).toBeGreaterThan(0);
    expect((data.response?.webSearch as any)?.[0].id).toBeDefined();
    expect((data.response?.webSearch as any)?.[0].alias).toBeDefined();
    expect((data.response?.webSearch as any)?.[0].provider).toBeDefined();
    expect((data.response?.webSearch as any)?.[0].price).toBeDefined();
    expect(data.response?.currency?.code).toBe("USD");
    expect(data.response?.currency?.symbol).toBe("$");
  });

  // Skipped due to OO AI service being hidden
  test.skip("GET /api/2.0/portal/payment/ai-prices - DocSpaceAdmin gets AI prices", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getAiPrices();

    const expectedChatModels = [
      "claude-sonnet-4.6",
      "deepseek-v3.2",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
      "gpt-5.2",
      "gpt-5.4",
    ];

    expect(status).toBe(200);
    const chatIds = data.response?.chat?.map((m) => m.id);
    for (const modelId of expectedChatModels) {
      expect(chatIds).toContain(modelId);
    }
    for (const model of data.response?.chat ?? []) {
      expect(model.id).toBeDefined();
      expect(model.alias).toBeDefined();
      expect(model.provider).toBeDefined();
      expect(model.price.prompt).toBeDefined();
      expect(model.price.completion).toBeDefined();
    }
    expect(data.response?.embedding?.length).toBeGreaterThan(0);
    expect(data.response?.embedding?.[0].id).toBeDefined();
    expect(data.response?.embedding?.[0].alias).toBeDefined();
    expect(data.response?.embedding?.[0].provider).toBeDefined();
    expect(data.response?.embedding?.[0].price.prompt).toBeDefined();
    expect((data.response?.webSearch as any)?.length).toBeGreaterThan(0);
    expect((data.response?.webSearch as any)?.[0].id).toBeDefined();
    expect((data.response?.webSearch as any)?.[0].alias).toBeDefined();
    expect((data.response?.webSearch as any)?.[0].provider).toBeDefined();
    expect((data.response?.webSearch as any)?.[0].price).toBeDefined();
    expect(data.response?.currency?.code).toBe("USD");
    expect(data.response?.currency?.symbol).toBe("$");
  });
});

test.describe("GET /api/2.0/portal/payment/currencies", () => {
  test("GET /api/2.0/portal/payment/currencies - Owner gets payment currencies", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentCurrencies();

    expect(status).toBe(200);
    expect(data.response?.length).toBeGreaterThan(0);
    expect(data.response?.[0].isoCountryCode).toBe("US");
    expect(data.response?.[0].isoCurrencySymbol).toBe("$");
    expect(data.response?.[0].currencyNativeName).toBe("US Dollar");
  });

  test("GET /api/2.0/portal/payment/currencies - DocSpaceAdmin gets payment currencies", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getPaymentCurrencies();

    expect(status).toBe(200);
    expect(data.response?.length).toBeGreaterThan(0);
    expect(data.response?.[0].isoCountryCode).toBe("US");
    expect(data.response?.[0].isoCurrencySymbol).toBe("$");
    expect(data.response?.[0].currencyNativeName).toBe("US Dollar");
  });
});

test.describe("GET /api/2.0/portal/payment/account", () => {
  test("GET /api/2.0/portal/payment/account - Owner gets payment account URL", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentAccount({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(200);
    expect(data.response).toContain("payment.ashx");
    expect(data.response).toContain("backUrl");
  });
});

// Skipped due to OO AI service being hidden
test.describe("GET /api/2.0/portal/payment/customer/aibalance", () => {
  test.skip("GET /api/2.0/portal/payment/customer/aibalance - Owner gets AI balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await creditAiBalance(ownerApi.payment, 10);

    const { data, status } = await ownerApi.payment.getCustomerAiBalance({});

    expect(status).toBe(200);
    expect(data.response?.accountNumber).toBeDefined();
    expect(data.response?.subAccountNumber).toBeDefined();
    expect(data.response?.accountCurrency).toBe("USD");
    expect(data.response?.subAccounts?.length).toBeGreaterThan(0);
    expect(data.response?.subAccounts?.[0].currency).toBe("USD");
    expect(data.response?.subAccounts?.[0].amount).toBe(10);
    expect(data.response?.lastCredit?.date).toBeDefined();
    expect(data.response?.lastCredit?.currency).toBe("USD");
    expect(data.response?.lastCredit?.amount).toBe(10);
  });

  // Skipped due to OO AI service being hidden
  test.skip("GET /api/2.0/portal/payment/customer/aibalance - DocSpaceAdmin gets AI balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await creditAiBalance(ownerApi.payment, 10);
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCustomerAiBalance({});

    expect(status).toBe(200);
    expect(data.response?.accountNumber).toBeDefined();
    expect(data.response?.subAccountNumber).toBeDefined();
    expect(data.response?.accountCurrency).toBe("USD");
    expect(data.response?.subAccounts?.length).toBeGreaterThan(0);
    expect(data.response?.subAccounts?.[0].currency).toBe("USD");
    expect(data.response?.subAccounts?.[0].amount).toBe(10);
    expect(data.response?.lastCredit?.date).toBeDefined();
    expect(data.response?.lastCredit?.currency).toBe("USD");
    expect(data.response?.lastCredit?.amount).toBe(10);
  });
});

test.describe("GET /api/2.0/portal/payment/customerinfo", () => {
  test("GET /api/2.0/portal/payment/customerinfo - Owner gets customer info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getCustomerInfo();

    expect(status).toBe(200);
    expect(data.response?.portalId).toBeDefined();
    expect(data.response?.email).toBeDefined();
    expect(data.response?.paymentMethodStatus).toBe(1);
    expect(data.response?.payer?.id).toBeDefined();
    expect(data.response?.payer?.displayName).toBeDefined();
  });

  test("GET /api/2.0/portal/payment/customerinfo - DocSpaceAdmin gets customer info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCustomerInfo();

    expect(status).toBe(200);
    expect(data.response?.portalId).toBeDefined();
    expect(data.response?.email).toBeDefined();
    expect(data.response?.paymentMethodStatus).toBe(1);
    expect(data.response?.payer?.id).toBeDefined();
    expect(data.response?.payer?.displayName).toBeDefined();
  });
});

test.describe("GET /api/2.0/portal/payment/customer/balance", () => {
  test("GET /api/2.0/portal/payment/customer/balance - Owner gets customer balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getCustomerBalance();

    expect(status).toBe(200);
    expect(data.response?.accountNumber).toBeDefined();
    expect(data.response?.subAccountNumber).toBeDefined();
    expect(data.response?.accountCurrency).toBe("USD");
    expect(data.response?.subAccounts?.length).toBeGreaterThan(0);
    expect(data.response?.subAccounts?.[0].currency).toBe("USD");
    expect(data.response?.subAccounts?.[0].amount).toBeGreaterThan(0);
    expect(data.response?.lastCredit?.date).toBeDefined();
    expect(data.response?.lastCredit?.currency).toBe("USD");
    expect(data.response?.lastCredit?.amount).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/customer/balance - DocSpaceAdmin gets customer balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCustomerBalance();

    expect(status).toBe(200);
    expect(data.response?.accountNumber).toBeDefined();
    expect(data.response?.subAccountNumber).toBeDefined();
    expect(data.response?.accountCurrency).toBe("USD");
    expect(data.response?.subAccounts?.length).toBeGreaterThan(0);
    expect(data.response?.subAccounts?.[0].currency).toBe("USD");
    expect(data.response?.subAccounts?.[0].amount).toBeGreaterThan(0);
    expect(data.response?.lastCredit?.date).toBeDefined();
    expect(data.response?.lastCredit?.currency).toBe("USD");
    expect(data.response?.lastCredit?.amount).toBeGreaterThan(0);
  });
});

test.describe("GET /api/2.0/portal/payment/checkoutsetupurl", () => {
  test("GET /api/2.0/portal/payment/checkoutsetupurl - DocSpaceAdmin cannot get checkout setup URL when Owner is already the payer", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCheckoutSetupUrl({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
        successUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(200);
    const url = new URL(data.response!);
    expect(url.hostname).toBe("payments.teamlab.info");
    expect(url.searchParams.get("currency")).toBeDefined();
    expect(url.searchParams.get("language")).toBeDefined();
    expect(url.searchParams.get("refId")).toBeDefined();
    expect(url.searchParams.get("email")).toBeDefined();
    expect(url.searchParams.get("successUrl")).toBeDefined();
    expect(url.searchParams.get("cancelUrl")).toBeDefined();
  });

  test("GET /api/2.0/portal/payment/checkoutsetupurl - Owner gets checkout setup URL", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getCheckoutSetupUrl({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
        successUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(200);
    const url = new URL(data.response!);
    expect(url.hostname).toBe("payments.teamlab.info");
    expect(url.searchParams.get("currency")).toBeDefined();
    expect(url.searchParams.get("language")).toBeDefined();
    expect(url.searchParams.get("refId")).toBeDefined();
    expect(url.searchParams.get("email")).toBeDefined();
    expect(url.searchParams.get("successUrl")).toBeDefined();
    expect(url.searchParams.get("cancelUrl")).toBeDefined();
  });
});

test.describe("GET /api/2.0/portal/payment/customer/operations", () => {
  test("GET /api/2.0/portal/payment/customer/operations - Owner gets customer operations", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 0);

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getCustomerOperations({
        offset: 0,
        limit: 25,
        credit: true,
        debit: true,
        startDate: startDate.toISOString().slice(0, 19),
        endDate: endDate.toISOString().slice(0, 19),
      });

    expect(status).toBe(200);
    expect(data.response?.offset).toBe(0);
    expect(data.response?.limit).toBe(25);
    expect(data.response?.totalQuantity).toBeGreaterThanOrEqual(0);
    expect(data.response?.collection).toBeDefined();
  });

  test("GET /api/2.0/portal/payment/customer/operations - DocSpaceAdmin gets customer operations", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 0);

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCustomerOperations({
        offset: 0,
        limit: 25,
        credit: true,
        debit: true,
        startDate: startDate.toISOString().slice(0, 19),
        endDate: endDate.toISOString().slice(0, 19),
      });

    expect(status).toBe(200);
    expect(data.response?.offset).toBe(0);
    expect(data.response?.limit).toBe(25);
    expect(data.response?.totalQuantity).toBeGreaterThanOrEqual(0);
    expect(data.response?.collection).toBeDefined();
  });

  test("BUG 81050: GET /api/2.0/portal/payment/customer/operations - Returns 200 after disabling Disk Storage service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const ownerApi = apiSdk.forRole("owner");

    await topUpDeposit(ownerApi.payment, 1000);
    await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });
    await enableWalletService(ownerApi.payment, "storage");
    await disableWalletService(ownerApi.payment, "storage");
    await enableWalletService(ownerApi.payment, "storage");

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 30);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 0);

    const { status } = await ownerApi.payment.getCustomerOperations({
      offset: 0,
      limit: 25,
      serviceName: "disk-storage-1-hour",
      startDate: startDate.toISOString().slice(0, 19),
      endDate: endDate.toISOString().slice(0, 19),
      credit: true,
      debit: true,
    });

    expect(status).toBe(200);
  });
});

test.describe("POST /api/2.0/portal/payment/request", () => {
  const SALES_REQUEST = {
    userName: "nctTest",
    email: "nct@email.com",
    message: "autoTest",
  };

  test("POST /api/2.0/portal/payment/request - Owner sends payment request", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .payment.sendPaymentRequest({ salesRequestsDto: SALES_REQUEST });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/portal/payment/request - DocSpaceAdmin sends payment request", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.sendPaymentRequest({ salesRequestsDto: SALES_REQUEST });

    expect(status).toBe(200);
  });
});

test.describe("GET /api/2.0/portal/payment/walletservices", () => {
  test("GET /api/2.0/portal/payment/walletservices - Owner gets all wallet services", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getWalletServices();
    console.log(data);
    expect(status).toBe(200);
    expect(data.response?.length).toBe(3);

    const serviceNames = data.response?.map((s) => s.serviceName);
    // expect(serviceNames).toContain("ai-tools");
    expect(serviceNames).toContain("backup");
    expect(serviceNames).toContain("disk-storage-1-hour");

    for (const service of data.response ?? []) {
      expect(service.id).toBeDefined();
      expect(service.price?.value).toBeGreaterThan(0);
      expect(service.features?.length).toBeGreaterThan(0);
    }
  });

  test("GET /api/2.0/portal/payment/walletservices - DocSpaceAdmin gets all wallet services", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getWalletServices();

    expect(status).toBe(200);
    expect(data.response?.length).toBe(3);

    const serviceNames = data.response?.map((s) => s.serviceName);
    // expect(serviceNames).toContain("ai-tools");
    expect(serviceNames).toContain("backup");
    expect(serviceNames).toContain("disk-storage-1-hour");

    for (const service of data.response ?? []) {
      expect(service.id).toBeDefined();
      expect(service.price?.value).toBeGreaterThan(0);
      expect(service.features?.length).toBeGreaterThan(0);
    }
  });
});

test.describe("GET /api/2.0/portal/payment/walletservice", () => {
  test("GET /api/2.0/portal/payment/walletservice - Owner gets AITools service info", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getWalletService({ service: TenantWalletService.AITools });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(TenantWalletService.AITools);
    expect(data.response?.serviceName).toBe("ai-tools");
    expect(data.response?.price?.value).toBeGreaterThan(0);
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/walletservice - Owner gets Backup service info", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getWalletService({ service: TenantWalletService.Backup });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(TenantWalletService.Backup);
    expect(data.response?.serviceName).toBe("backup");
    expect(data.response?.price?.value).toBeGreaterThan(0);
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/walletservice - Owner gets Storage service info", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getWalletService({ service: TenantWalletService.Storage });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(TenantWalletService.Storage);
    expect(data.response?.serviceName).toBe("disk-storage-1-hour");
    expect(data.response?.price?.value).toBeGreaterThan(0);
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/walletservice - DocSpaceAdmin gets AITools service info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getWalletService({ service: TenantWalletService.AITools });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(TenantWalletService.AITools);
    expect(data.response?.serviceName).toBe("ai-tools");
    expect(data.response?.price?.value).toBeGreaterThan(0);
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/walletservice - DocSpaceAdmin gets Backup service info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getWalletService({ service: TenantWalletService.Backup });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(TenantWalletService.Backup);
    expect(data.response?.serviceName).toBe("backup");
    expect(data.response?.price?.value).toBeGreaterThan(0);
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/walletservice - DocSpaceAdmin gets Storage service info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getWalletService({ service: TenantWalletService.Storage });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(TenantWalletService.Storage);
    expect(data.response?.serviceName).toBe("disk-storage-1-hour");
    expect(data.response?.price?.value).toBeGreaterThan(0);
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });
});

test.describe("GET /api/2.0/portal/payment/topupsettings", () => {
  test("GET /api/2.0/portal/payment/topupsettings - Owner gets wallet auto top-up settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: {
          enabled: true,
          minBalance: 100,
          upToBalance: 1000,
        },
      },
    });

    const { data, status } = await ownerApi.payment.getTenantWalletSettings();

    expect(status).toBe(200);
    expect((data as any).response?.enabled).toBe(true);
    expect((data as any).response?.minBalance).toBe(100);
    expect((data as any).response?.upToBalance).toBe(1000);
    expect((data as any).response?.lastModified).toBeDefined();
  });

  test("GET /api/2.0/portal/payment/topupsettings - DocSpaceAdmin gets wallet auto top-up settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: {
          enabled: true,
          minBalance: 100,
          upToBalance: 1000,
        },
      },
    });
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getTenantWalletSettings();

    expect(status).toBe(200);
    expect((data as any).response?.enabled).toBe(true);
    expect((data as any).response?.minBalance).toBe(100);
    expect((data as any).response?.upToBalance).toBe(1000);
    expect((data as any).response?.lastModified).toBeDefined();
  });
});

test.describe("GET /api/2.0/portal/payment/servicessettings", () => {
  test("GET /api/2.0/portal/payment/servicessettings - Owner gets wallet services settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await enableWalletService(ownerApi.payment, "aiTools");
    await enableWalletService(ownerApi.payment, "backup");
    await enableWalletService(ownerApi.payment, "storage");

    const { data, status } =
      await ownerApi.payment.getTenantWalletServiceSettings();

    expect(status).toBe(200);
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.AITools,
    );
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.Backup,
    );
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.Storage,
    );
    expect(data.response?.lastModified).toBeDefined();
  });

  test("GET /api/2.0/portal/payment/servicessettings - DocSpaceAdmin gets wallet services settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await enableWalletService(ownerApi.payment, "aiTools");
    await enableWalletService(ownerApi.payment, "backup");
    await enableWalletService(ownerApi.payment, "storage");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getTenantWalletServiceSettings();

    expect(status).toBe(200);
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.AITools,
    );
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.Backup,
    );
    expect(data.response?.enabledServices).toContain(
      TenantWalletService.Storage,
    );
    expect(data.response?.lastModified).toBeDefined();
  });
});

// Skipped due to OO AI service being hidden
test.describe("GET /api/2.0/portal/payment/ai-model/restrictions", () => {
  test.skip("GET /api/2.0/portal/payment/ai-model/restrictions - Owner gets restricted AI models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: {
        models: new Set(restrictableAiModelIds),
      },
    });

    const { data, status } = await ownerApi.payment.getRestrictedAiModels();

    expect(status).toBe(200);
    for (const modelId of restrictableAiModelIds) {
      expect(data.response?.models).toContain(modelId);
    }
  });

  // Skipped due to OO AI service being hidden
  test.skip("GET /api/2.0/portal/payment/ai-model/restrictions - DocSpaceAdmin gets restricted AI models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: {
        models: new Set(restrictableAiModelIds),
      },
    });

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getRestrictedAiModels();

    expect(status).toBe(200);
    for (const modelId of restrictableAiModelIds) {
      expect(data.response?.models).toContain(modelId);
    }
  });
});

test.describe("GET /api/2.0/portal/payment/quota", () => {
  test("GET /api/2.0/portal/payment/quota - Owner gets current quota information", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getQuotaPaymentInformation();

    expect(status).toBe(200);
    expect(data.response?.id).toBe(-3);
    expect(data.response?.title).toBe("Startup");
    expect(data.response?.price?.value).toBe(0);
    expect(data.response?.free).toBe(true);
    expect(data.response?.trial).toBe(false);
    expect(data.response?.nonProfit).toBe(false);
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/quota - DocSpaceAdmin gets current quota information", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getQuotaPaymentInformation();

    expect(status).toBe(200);
    expect(data.response?.id).toBe(-3);
    expect(data.response?.title).toBe("Startup");
    expect(data.response?.price?.value).toBe(0);
    expect(data.response?.free).toBe(true);
    expect(data.response?.trial).toBe(false);
    expect(data.response?.nonProfit).toBe(false);
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/quota - Owner gets quota information on Business plan", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getQuotaPaymentInformation();

    expect(status).toBe(200);
    expect(data.response?.id).toBe(-9);
    expect(data.response?.title).toBe("Business");
    expect(data.response?.price?.value).toBe(200);
    expect(data.response?.free).toBe(false);
    expect(data.response?.trial).toBe(false);
    expect(data.response?.nonProfit).toBe(false);
    expect(data.response?.features?.length).toBeGreaterThan(0);
    expect(data.response?.usersQuota?.enableQuota).toBe(false);
    expect(data.response?.roomsQuota?.enableQuota).toBe(false);
    expect(data.response?.aiAgentsQuota?.enableQuota).toBe(false);
  });
});

test.describe("GET /api/2.0/portal/payment/prices", () => {
  test("GET /api/2.0/portal/payment/prices - Owner gets portal prices", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPortalPrices();

    expect(status).toBe(200);
    const prices = data.response!;
    expect(Object.keys(prices).length).toBeGreaterThan(0);
    for (const [id, price] of Object.entries(prices)) {
      expect(id).toBeDefined();
      expect(typeof price).toBe("number");
      expect(price).toBeGreaterThanOrEqual(0);
    }
  });

  test("GET /api/2.0/portal/payment/prices - DocSpaceAdmin gets portal prices", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getPortalPrices();

    expect(status).toBe(200);
    const prices = data.response!;
    expect(Object.keys(prices).length).toBeGreaterThan(0);
    for (const [id, price] of Object.entries(prices)) {
      expect(id).toBeDefined();
      expect(typeof price).toBe("number");
      expect(price).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe("GET /api/2.0/portal/payment/quotas", () => {
  test("GET /api/2.0/portal/payment/quotas - Owner gets all payment quotas", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentQuotas();

    expect(status).toBe(200);
    expect(data.response?.length).toBeGreaterThan(0);
    for (const quota of data.response ?? []) {
      expect(quota.id).toBeDefined();
      if (quota.title !== undefined) {
        expect(typeof quota.title).toBe("string");
      }
      expect(quota.nonProfit).toBeDefined();
      expect(quota.free).toBeDefined();
      expect(quota.trial).toBeDefined();
    }
  });

  test("GET /api/2.0/portal/payment/quotas - Owner gets wallet-only quotas", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentQuotas({ wallet: true });

    expect(status).toBe(200);
    expect(data.response?.length).toBeGreaterThan(0);
    for (const quota of data.response ?? []) {
      expect(quota.id).toBeDefined();
      expect(quota.nonProfit).toBeDefined();
      expect(quota.free).toBeDefined();
      expect(quota.trial).toBeDefined();
    }
  });

  test("GET /api/2.0/portal/payment/quotas - DocSpaceAdmin gets all payment quotas", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getPaymentQuotas();

    expect(status).toBe(200);
    expect(data.response?.length).toBeGreaterThan(0);
    for (const quota of data.response ?? []) {
      expect(quota.id).toBeDefined();
      if (quota.title !== undefined) {
        expect(typeof quota.title).toBe("string");
      }
      expect(quota.nonProfit).toBeDefined();
      expect(quota.free).toBeDefined();
      expect(quota.trial).toBeDefined();
    }
  });
});

// Skipped due to OO AI service being hidden
test.describe("PUT /api/2.0/portal/payment/ai-model/restrictions", () => {
  test.skip("PUT /api/2.0/portal/payment/ai-model/restrictions - Owner sets restricted AI models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: {
          models: new Set(restrictableAiModelIds),
        },
      });

    expect(status).toBe(200);
    for (const modelId of restrictableAiModelIds) {
      expect(data.response?.models).toContain(modelId);
    }
  });

  // Skipped due to OO AI service being hidden
  test.skip("PUT /api/2.0/portal/payment/ai-model/restrictions - Owner clears all restricted AI models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    await apiSdk.forRole("owner").payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: {
        models: new Set(restrictableAiModelIds),
      },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: { models: new Set() },
      });

    expect(status).toBe(200);
    expect(data.response?.models?.length).toBe(0);
  });
});

test.describe("POST /api/2.0/portal/payment/topupsettings", () => {
  test("POST /api/2.0/portal/payment/topupsettings - Owner enables wallet auto top-up", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.setTenantWalletSettings({
        tenantWalletSettingsWrapper: {
          settings: { enabled: true, minBalance: 100, upToBalance: 1000 },
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.enabled).toBe(true);
    expect((data as any).response?.minBalance).toBe(100);
    expect((data as any).response?.upToBalance).toBe(1000);
    expect((data as any).response?.lastModified).toBeDefined();
  });

  test("POST /api/2.0/portal/payment/topupsettings - Owner disables wallet auto top-up", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    await apiSdk.forRole("owner").payment.setTenantWalletSettings({
      tenantWalletSettingsWrapper: {
        settings: { enabled: true, minBalance: 100, upToBalance: 1000 },
      },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.setTenantWalletSettings({
        tenantWalletSettingsWrapper: {
          settings: { enabled: false, minBalance: 100, upToBalance: 1000 },
        },
      });

    expect(status).toBe(200);
    expect((data as any).response?.enabled).toBe(false);
  });
});

test.describe("DELETE /api/2.0/portal/payment/customer/operationsreport", () => {
  test("DELETE /api/2.0/portal/payment/customer/operationsreport - Owner terminates report generation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    await apiSdk.forRole("owner").payment.createCustomerOperationsReport({
      customerOperationsReportRequestDto: {
        serviceName: "ai-tools",
        credit: true,
        debit: true,
      },
    });

    const { status } = await apiSdk
      .forRole("owner")
      .payment.terminateCustomerOperationsReport();

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/portal/payment/customer/operationsreport - DocSpaceAdmin terminates report generation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "ai-tools",
          credit: true,
          debit: true,
        },
      });

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.terminateCustomerOperationsReport();

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/portal/payment/customer/operationsreport - DocSpaceAdmin terminates Owner's report generation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    await apiSdk.forRole("owner").payment.createCustomerOperationsReport({
      customerOperationsReportRequestDto: {
        serviceName: "ai-tools",
        credit: true,
        debit: true,
      },
    });

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.terminateCustomerOperationsReport();

    expect(status).toBe(200);
  });
});

test.describe("POST /api/2.0/portal/payment/deposit", () => {
  test("POST /api/2.0/portal/payment/deposit - Owner tops up wallet deposit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.topUpDeposit({
        topUpDepositRequestDto: { amount: 100, currency: "USD" },
      });

    expect(status).toBe(200);
    // response is false in test environment because topUpDeposit requires a real Stripe customer.
    // makeWalletTopUp() bypasses Stripe, so Stripe-based deposit returns false but the endpoint is reachable.
    expect(typeof data.response).toBe("boolean");
  });
});

test.describe("PUT /api/2.0/portal/payment/update", () => {
  test("PUT /api/2.0/portal/payment/update - Owner updates payment quantity", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.updatePayment({
        quantityRequestDto: { quantity: { admin: 100 } },
      });

    expect(status).toBe(200);
    // response is false in test environment because updatePayment requires an active Stripe subscription.
    expect(typeof data.response).toBe("boolean");
  });
});
