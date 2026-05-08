import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { TenantWalletService } from "@onlyoffice/docspace-api-sdk";
import {
  topUpDeposit,
  buyWalletService,
  enableWalletService,
  disableWalletService,
} from "@/src/helpers/wallet-services";

test.describe("PUT /api/2.0/portal/payment/url", () => {
  test("PUT /api/2.0/portal/payment/url - Owner gets payment page URL", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: apiSdk.tokenStore.portalBaseUrl,
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

// buyWalletService for "backup" is not tested directly.
// Unlike "storage" and "ai-tools" (manual purchase), backup is charged automatically by the system:
// paid portals include 2 free backups, and on the 3rd execution the system calls buyWalletService
// and deducts funds from the wallet. Automating this would require running 3 real backups,
// which is too slow and brittle for a unit-level API test.
test.describe("POST /api/2.0/portal/payment/buywalletservice", () => {
  test("POST /api/2.0/portal/payment/buywalletservice - Owner buys ai-tools service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    const { data, status } = await buyWalletService(
      ownerApi.payment,
      "aiTools",
      10,
    );
    expect(status).toBe(200);
    expect(data.response?.operationId).toBeDefined();
    expect(data.response?.amount).toBeDefined();
    expect(data.response?.currency).toBe("USD");
    expect(data.response?.quantity).toBe(10);
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

test.describe("POST /api/2.0/portal/payment/customer/operationsreport", () => {
  test("POST /api/2.0/portal/payment/customer/operationsreport - Owner creates report for ai-tools", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await buyWalletService(ownerApi.payment, "aiTools", 10);
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

  test("POST /api/2.0/portal/payment/customer/operationsreport - DocSpaceAdmin creates report for ai-tools", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await buyWalletService(ownerApi.payment, "aiTools", 10);
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

test.describe("GET /api/2.0/portal/payment/ai-prices", () => {
  test("GET /api/2.0/portal/payment/ai-prices - Owner gets AI prices", async ({
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

  test("GET /api/2.0/portal/payment/ai-prices - DocSpaceAdmin gets AI prices", async ({
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

test.describe("GET /api/2.0/portal/payment/checkoutsetupurl", () => {
  test("GET /api/2.0/portal/payment/checkoutsetupurl - DocSpaceAdmin cannot get checkout setup URL when Owner is already the payer", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCheckoutSetupUrl({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
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
  test("BUG 81050: GET /api/2.0/portal/payment/customer/operations - Returns 200 after disabling Disk Storage service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const ownerApi = apiSdk.forRole("owner");

    await topUpDeposit(ownerApi.payment, 1000);
    await buyWalletService(ownerApi.payment, "storage", 100);
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
