import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { TenantWalletService } from "@onlyoffice/docspace-api-sdk";
import {
  topUpDeposit,
  creditAiBalance,
  enableWalletService,
  disableWalletService,
  enableAiGateway,
} from "@/src/helpers/wallet-services";
import { AiProfiles } from "@/src/helpers/ai-profiles";
import { ApiSDK } from "@/src/services/api-sdk";
import { Role } from "@/src/services/token-store";

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

// The AI balance is a wallet sub-account these portals do not have: measured
// 2026-08-19, both crediting it and reading it back answer 404 (it used to be
// 403 "Accounting client does not support sub-accounts"). Nothing in test code
// provisions it, and AI spend does not need it — chat charges are debited from
// the ordinary wallet balance, which ai/billing/billing.spec.ts asserts.
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

  test("POST /api/2.0/portal/payment/servicestate - DocSpaceAdmin enables ai-tools service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
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

  test("POST /api/2.0/portal/payment/servicestate - DocSpaceAdmin disables ai-tools service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");
    await enableWalletService(adminApi.payment, "aiTools");

    const { data, status } =
      await adminApi.payment.changeTenantWalletServiceState({
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

    await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });

    await paymentsApi.refreshPaymentInfo();

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
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });

    await paymentsApi.refreshPaymentInfo();

    await ownerApi.payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 0 },
        productQuantityType: 0,
      },
    });

    await paymentsApi.refreshPaymentInfo();

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

  test("PUT /api/2.0/portal/payment/updatewallet - DocSpaceAdmin adds storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.updateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
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

  test("PUT /api/2.0/portal/payment/calculatewallet - DocSpaceAdmin calculates wallet payment for storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(200);
    expect(data.response?.amount).toBeDefined();
    expect(data.response?.currency).toBe("USD");
    expect(data.response?.quantity).toBe(100);
  });
});

// The wallet's spend export. The `ai-tools` cases were skipped as "OO AI service
// being hidden"; measured 2026-08-19 the add-on is live and its report builds
// like any other service's, so they run. The charges the report is built from
// are covered in ai/billing/billing.spec.ts.
test.describe("POST /api/2.0/portal/payment/customer/operationsreport", () => {
  test("POST /api/2.0/portal/payment/customer/operationsreport - Owner creates report for ai-tools", async ({
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
          serviceName: ["ai-tools"],
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
          serviceName: ["backup"],
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
          serviceName: ["disk-storage-1-hour"],
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
    await creditAiBalance(ownerApi.payment, 10);
    await enableWalletService(ownerApi.payment, "aiTools");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: ["ai-tools"],
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
          serviceName: ["backup"],
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
          serviceName: ["disk-storage-1-hour"],
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

// The wallet's spend export. The `ai-tools` cases were skipped as "OO AI service
// being hidden"; measured 2026-08-19 the add-on is live and its report builds
// like any other service's, so they run. The charges the report is built from
// are covered in ai/billing/billing.spec.ts.
test.describe("GET /api/2.0/portal/payment/customer/operationsreport", () => {
  test("GET /api/2.0/portal/payment/customer/operationsreport - Owner gets report generation status", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const ownerApi = apiSdk.forRole("owner");
    await creditAiBalance(ownerApi.payment, 10);
    await enableWalletService(ownerApi.payment, "aiTools");
    await ownerApi.payment.createCustomerOperationsReport({
      customerOperationsReportRequestDto: {
        serviceName: ["ai-tools"],
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

  test("GET /api/2.0/portal/payment/customer/operationsreport - DocSpaceAdmin gets report generation status", async ({
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
        serviceName: ["ai-tools"],
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
    expect((data.response?.search as any)?.length).toBeGreaterThan(0);
    expect((data.response?.search as any)?.[0].id).toBeDefined();
    expect((data.response?.search as any)?.[0].alias).toBeDefined();
    expect((data.response?.search as any)?.[0].provider).toBeDefined();
    expect((data.response?.search as any)?.[0].price).toBeDefined();
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
    expect((data.response?.search as any)?.length).toBeGreaterThan(0);
    expect((data.response?.search as any)?.[0].id).toBeDefined();
    expect((data.response?.search as any)?.[0].alias).toBeDefined();
    expect((data.response?.search as any)?.[0].provider).toBeDefined();
    expect((data.response?.search as any)?.[0].price).toBeDefined();
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

// The AI balance is a wallet sub-account these portals do not have: measured
// 2026-08-19, both crediting it and reading it back answer 404 (it used to be
// 403 "Accounting client does not support sub-accounts"). Nothing in test code
// provisions it, and AI spend does not need it — chat charges are debited from
// the ordinary wallet balance, which ai/billing/billing.spec.ts asserts.
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
      serviceName: ["disk-storage-1-hour"],
      startDate: startDate.toISOString().slice(0, 19),
      endDate: endDate.toISOString().slice(0, 19),
      credit: true,
      debit: true,
    });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/portal/payment/customer/operations - orderBy date ascending returns operations in chronological order", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp(500);
    await paymentsApi.makeWalletTopUp(500);

    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 0);
    const startDate = start.toISOString().slice(0, 19);
    const endDate = end.toISOString().slice(0, 19);

    const { data: asc, status: statusAsc } = await apiSdk
      .forRole("owner")
      .payment.getCustomerOperations({
        offset: 0,
        limit: 25,
        credit: true,
        debit: true,
        startDate,
        endDate,
        orderBy: "date",
        orderType: 1,
      });

    const { data: desc, status: statusDesc } = await apiSdk
      .forRole("owner")
      .payment.getCustomerOperations({
        offset: 0,
        limit: 25,
        credit: true,
        debit: true,
        startDate,
        endDate,
        orderBy: "date",
        orderType: 0,
      });

    expect(statusAsc).toBe(200);
    expect(statusDesc).toBe(200);

    const ascItems = (asc.response?.collection ?? []) as any[];
    const descItems = (desc.response?.collection ?? []) as any[];

    if (ascItems.length >= 2) {
      const dates = ascItems.map((op: any) => new Date(op.date).getTime());
      expect(dates[0]).toBeLessThanOrEqual(dates[dates.length - 1]);
    }

    if (descItems.length >= 2) {
      const dates = descItems.map((op: any) => new Date(op.date).getTime());
      expect(dates[0]).toBeGreaterThanOrEqual(dates[dates.length - 1]);
    }
  });

  test("GET /api/2.0/portal/payment/customer/operations - participantName filter returns empty collection for unknown name", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const now = new Date();
    const start2 = new Date(now);
    start2.setDate(start2.getDate() - 30);
    start2.setHours(0, 0, 0, 0);
    const end2 = new Date(now);
    end2.setHours(23, 59, 59, 0);
    const startDate = start2.toISOString().slice(0, 19);
    const endDate = end2.toISOString().slice(0, 19);

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getCustomerOperations({
        offset: 0,
        limit: 25,
        credit: true,
        debit: true,
        startDate,
        endDate,
        participantName: "nonexistent-participant-xyz",
      });

    expect(status).toBe(200);
    expect(data.response?.collection).toBeDefined();
    expect((data.response?.collection ?? []).length).toBe(0);
  });
});

// The per-service side of the wallet: `customer/operations` lists the charges
// one by one, this aggregates them per service. It is what makes "billed as a
// service of its own" observable — an add-on gets its own row here, with its own
// unit, quantity and total. The add-on that actually produces a row is covered
// in ai/web-search/web-search.spec.ts, which spends one before reading it back.
test.describe("GET /api/2.0/portal/payment/customer/usage", () => {
  test("GET /api/2.0/portal/payment/customer/usage - Owner gets usage aggregated per service", async ({
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
      .payment.getCustomerServiceUsage({
        offset: 0,
        limit: 25,
        startDate: startDate.toISOString().slice(0, 19),
        endDate: endDate.toISOString().slice(0, 19),
      });

    expect(status).toBe(200);
    expect(data.response?.offset).toBe(0);
    expect(data.response?.currentPage).toBe(1);
    expect(data.response?.totalQuantity).toBeGreaterThanOrEqual(0);
    expect(data.response?.collection).toBeDefined();
    // Unlike `customer/operations`, this route does not echo the requested page
    // size: `limit` comes back as the number of rows actually returned (0 with an
    // empty collection), so a test asserting the 25 it asked for would fail.
    expect(data.response?.limit).toBe(data.response?.collection?.length);

    // A fresh portal may have been charged for nothing yet, so the rows are
    // asserted only if there are any — their shape is the contract either way.
    for (const row of data.response?.collection ?? []) {
      expect(row.service?.length).toBeGreaterThan(0);
      expect(row.operationCount).toBeGreaterThanOrEqual(0);
      expect(row.totalAmount).toBeGreaterThanOrEqual(0);
    }
  });

  test("GET /api/2.0/portal/payment/customer/usage - DocSpaceAdmin filters usage by service name", async ({
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
      .payment.getCustomerServiceUsage({
        offset: 0,
        limit: 25,
        serviceName: ["ai-search"],
        startDate: startDate.toISOString().slice(0, 19),
        endDate: endDate.toISOString().slice(0, 19),
      });

    expect(status).toBe(200);
    expect(data.response?.collection).toBeDefined();
    // Whatever the filter returns, it must be about the service that was asked
    // for — the filter, not the totals, is what this test pins down.
    for (const row of data.response?.collection ?? []) {
      expect(row.service).toBe("ai-search");
    }
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

    expect(status).toBe(200);
    expect(data.response?.length).toBe(6);

    const serviceNames = data.response?.map((s) => s.serviceName);
    expect(serviceNames).toContain("disk-storage-1-hour");
    expect(serviceNames).toContain("backup");
    expect(serviceNames).toContain("ai-tools");
    expect(serviceNames).toContain("docscloud-1-hour");
    expect(serviceNames).toContain("docscloud-devpack-1-hour");
    expect(serviceNames).toContain("ai-search");

    const expectedPrices: Record<string, number> = {
      "disk-storage-1-hour": 0.14,
      backup: 10,
      "ai-tools": 0,
      "docscloud-1-hour": 8,
      "docscloud-devpack-1-hour": 12,
      "ai-search": 0,
    };

    for (const service of data.response ?? []) {
      expect(service.id).toBeDefined();
      expect(service.price?.value).toBe(expectedPrices[service.serviceName!]);
      expect(service.price?.isoCurrencySymbol).toBe("USD");
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
    expect(data.response?.length).toBe(6);

    const serviceNames = data.response?.map((s) => s.serviceName);
    expect(serviceNames).toContain("disk-storage-1-hour");
    expect(serviceNames).toContain("backup");
    expect(serviceNames).toContain("ai-tools");
    expect(serviceNames).toContain("docscloud-1-hour");
    expect(serviceNames).toContain("docscloud-devpack-1-hour");
    expect(serviceNames).toContain("ai-search");

    const expectedPrices: Record<string, number> = {
      "disk-storage-1-hour": 0.14,
      backup: 10,
      "ai-tools": 0,
      "docscloud-1-hour": 8,
      "docscloud-devpack-1-hour": 12,
      "ai-search": 0,
    };

    for (const service of data.response ?? []) {
      expect(service.id).toBeDefined();
      expect(service.price?.value).toBe(expectedPrices[service.serviceName!]);
      expect(service.price?.isoCurrencySymbol).toBe("USD");
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
    expect(data.response?.price?.value).toBe(0);
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

  // Web search is sold as an add-on of its own, with its own management page,
  // and this is the endpoint that page reads. Priced like ai-tools: the switch
  // costs nothing, the searches are billed to the wallet as they happen.
  test("GET /api/2.0/portal/payment/walletservice - Owner gets AISearch service info", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getWalletService({ service: TenantWalletService.AISearch });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(TenantWalletService.AISearch);
    expect(data.response?.serviceName).toBe("ai-search");
    expect(data.response?.price?.value).toBe(0);
    expect(data.response?.price?.isoCurrencySymbol).toBe("USD");
    expect(data.response?.features?.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/portal/payment/walletservice - DocSpaceAdmin gets AISearch service info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getWalletService({ service: TenantWalletService.AISearch });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(TenantWalletService.AISearch);
    expect(data.response?.serviceName).toBe("ai-search");
    expect(data.response?.price?.value).toBe(0);
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
    expect(data.response?.price?.value).toBe(0);
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

// The gateway catalogue (GET /ai/profiles/list) is not a fixed contract — see
// [[ai_profiles_catalogue_contract]] — so restriction tests pick real,
// currently-offered modelIds live instead of trusting a hardcoded list.
// `restrictableAiModelIds` is kept only for the tests that still use it below.
async function liveModelIds(apiSdk: ApiSDK, count: number): Promise<string[]> {
  const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
  const catalogue = await profiles.catalogue("owner");
  const ids = catalogue
    .map((p) => p.modelId)
    .filter((id): id is string => !!id);
  if (ids.length < count) {
    throw new Error(`Need ${count} modelIds, catalogue has ${ids.length}`);
  }
  return ids.slice(0, count);
}

/** Raw request, bypassing the typed SDK — needed to send bodies the generated
 * client's types would reject (missing fields, wrong JSON types). */
async function rawRestrictionsCall(
  apiSdk: ApiSDK,
  role: Role,
  method: "get" | "put",
  body?: unknown,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  headers.Authorization = `Bearer ${apiSdk.tokenStore.getToken(role)}`;
  const response = await apiSdk.request[method](
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/portal/payment/ai-model/restrictions`,
    { headers, ...(body === undefined ? {} : { data: body }) },
  );
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  return { status: response.status(), data: parsed as any, text };
}

test.describe("GET /api/2.0/portal/payment/ai-model/restrictions", () => {
  test("GET /api/2.0/portal/payment/ai-model/restrictions - Owner gets restricted AI models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [modelId] = await liveModelIds(apiSdk, 1);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([modelId]) },
    });

    const { data, status } = await ownerApi.payment.getRestrictedAiModels();

    expect(status).toBe(200);
    expect(data.response?.models).toEqual([modelId]);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  test("GET /api/2.0/portal/payment/ai-model/restrictions - DocSpaceAdmin gets restricted AI models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [modelId] = await liveModelIds(apiSdk, 1);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([modelId]) },
    });

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getRestrictedAiModels();

    expect(status).toBe(200);
    expect(data.response?.models).toEqual([modelId]);

    await apiSdk.authenticateOwner();
    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  // Measured 2026-08-21: setting restrictions with `setRestrictedAiModels`
  // silently does nothing — 200, echoes the request back — unless the
  // portal's AITools wallet service is enabled first. Every other test in
  // this file calls `enableAiGateway` (which enables it) so it isn't hit by
  // this; this one pins the bug itself, so a future refactor that drops the
  // call gets caught here instead of producing baffling empty GETs three
  // tests away.
  //
  // Filed as BUG XXXXX: a 200 that persists nothing is a false success — the
  // route should either refuse the write outright (403/409, "enable AITools
  // first") or actually persist it. Answering 200 with an echo of the request
  // while silently doing nothing is neither.
  test("BUG XXXXX: PUT /api/2.0/portal/payment/ai-model/restrictions - without the AITools wallet service, a 200 write does not persist", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    const ownerApi = apiSdk.forRole("owner");
    const [modelId] = await liveModelIds(apiSdk, 1);

    const put = await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([modelId]) },
    });
    const get = await ownerApi.payment.getRestrictedAiModels();

    test.fail();
    expect(
      put.status !== 200 || (get.data.response?.models?.length ?? 0) > 0,
      "a 200 write should actually persist — a refusal (any non-200) is an " +
        "equally acceptable fix, so this only fails on the current shape: " +
        "200 AND nothing stored",
    ).toBe(true);
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

  test("GET /api/2.0/portal/payment/quotas - Owner gets additional-only quotas", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentQuotas({ additional: true });

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);

    for (const quota of data.response ?? []) {
      expect(typeof quota.id).toBe("number");
      expect(typeof quota.nonProfit).toBe("boolean");
      expect(typeof quota.free).toBe("boolean");
      expect(typeof quota.trial).toBe("boolean");
      expect(Array.isArray((quota as any).features)).toBe(true);
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

// Contract measured live 2026-08-21 against a real gateway catalogue:
//   * The stored set always comes back sorted, deduplicated, regardless of
//     input order or repeats — never treat order or count-of-input as meaningful.
//   * A PUT is a full REPLACE, not a merge: whatever was not in this request is
//     gone.
//   * A modelId the catalogue does not currently offer (unknown, blank,
//     whitespace, wrong case) is silently dropped — not stored, not an error.
//     Matching is case-sensitive.
//   * DocSpaceAdmin's old 500 on a non-empty set (the reason it was
//     `test.skip`'d) no longer reproduces — it behaves exactly like Owner.
test.describe("PUT /api/2.0/portal/payment/ai-model/restrictions", () => {
  test("PUT /api/2.0/portal/payment/ai-model/restrictions - Owner sets one restricted model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [modelId] = await liveModelIds(apiSdk, 1);

    const { data, status } = await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([modelId]) },
    });

    expect(status).toBe(200);
    expect(data.response?.models).toEqual([modelId]);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - Owner sets multiple restricted models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [a, b] = await liveModelIds(apiSdk, 2);

    const { data, status } = await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([a, b]) },
    });

    expect(status).toBe(200);
    expect(data.response?.models?.slice().sort()).toEqual([a, b].sort());

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - a new list fully replaces the previous one", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [a, b, c] = await liveModelIds(apiSdk, 3);
    const set = (models: string[]) =>
      ownerApi.payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: { models: new Set(models) },
      });

    await set([a, b]);
    const { data, status } = await set([c]);

    expect(status).toBe(200);
    expect(data.response?.models).toEqual([c]);

    const { data: got } = await ownerApi.payment.getRestrictedAiModels();
    expect(got.response?.models, "A and B are gone, only C remains").toEqual([
      c,
    ]);

    await set([]);
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - replacing a multi-item list with an overlapping one keeps only the new set", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [a, b, c] = await liveModelIds(apiSdk, 3);
    const set = (models: string[]) =>
      ownerApi.payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: { models: new Set(models) },
      });

    await set([a, b]);
    await set([b, c]);

    const { data } = await ownerApi.payment.getRestrictedAiModels();
    expect(data.response?.models?.slice().sort()).toEqual([b, c].sort());

    await set([]);
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - Owner clears all restricted AI models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [a, b] = await liveModelIds(apiSdk, 2);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([a, b]) },
    });

    const { data, status } = await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    expect(status).toBe(200);
    expect(data.response?.models?.length).toBe(0);

    const { data: got } = await ownerApi.payment.getRestrictedAiModels();
    expect(got.response?.models).toEqual([]);
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - clearing an already-empty list is a no-op 200", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data, status } = await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });

    expect(status).toBe(200);
    expect(data.response?.models).toEqual([]);
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - re-setting the same list is idempotent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [a, b] = await liveModelIds(apiSdk, 2);
    const set = () =>
      ownerApi.payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: { models: new Set([a, b]) },
      });

    await set();
    const { data, status } = await set();

    expect(status).toBe(200);
    expect(data.response?.models?.slice().sort()).toEqual([a, b].sort());

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - input order does not matter, the stored set is always sorted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [a, b] = await liveModelIds(apiSdk, 2);
    const sorted = [a, b].sort();

    const forward = await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([a, b]) },
    });
    const reversed = await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([b, a]) },
    });

    expect(forward.data.response?.models).toEqual(sorted);
    expect(reversed.data.response?.models).toEqual(sorted);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - a duplicated modelId in one request is deduplicated", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [modelId] = await liveModelIds(apiSdk, 1);

    // A `Set` already dedupes client-side, so send the duplicate through the
    // raw call to actually exercise the server's own handling.
    const { data, status } = await rawRestrictionsCall(apiSdk, "owner", "put", {
      models: [modelId, modelId],
    });

    expect(status).toBe(200);
    expect(data.response?.models).toEqual([modelId]);

    const { data: got } = await ownerApi.payment.getRestrictedAiModels();
    expect(got.response?.models).toEqual([modelId]);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - a modelId the catalogue does not offer is silently dropped, not stored or erred", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [modelId] = await liveModelIds(apiSdk, 1);

    for (const [label, badId] of [
      ["a name no provider has", "not-a-real-model-xyz"],
      ["whitespace only", "   "],
      ["empty string", ""],
      ["a very long garbage string", "x".repeat(5000)],
      ["the right id, wrong case", modelId.toUpperCase()],
    ] as const) {
      const { data, status } = await rawRestrictionsCall(
        apiSdk,
        "owner",
        "put",
        { models: [badId] },
      );
      expect(status, label).toBe(200);
      expect(data.response?.models, label).toEqual([]);
    }

    const { data: got } = await ownerApi.payment.getRestrictedAiModels();
    expect(got.response?.models, "nothing was ever actually stored").toEqual(
      [],
    );
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - malformed body shapes answer a controlled 4xx, never a 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [modelId] = await liveModelIds(apiSdk, 1);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([modelId]) },
    });

    const cases: Array<[string, unknown]> = [
      ["no body at all", undefined],
      ["an empty object", {}],
      ["models: null", { models: null }],
      ["models: '' (a string, not an array)", { models: "" }],
      ["models: a bare string", { models: modelId }],
      ["models: an object", { models: {} }],
      ["models: a number", { models: 123 }],
      ["models: a boolean", { models: true }],
      ["models: [123] (wrong element type)", { models: [123] }],
      ["models: [true]", { models: [true] }],
      ["models: [{}]", { models: [{}] }],
      ["models: mixed valid + invalid element", { models: [modelId, 123] }],
    ];

    for (const [label, body] of cases) {
      const { status } = await rawRestrictionsCall(
        apiSdk,
        "owner",
        "put",
        body,
      );
      expect(status, label).toBeGreaterThanOrEqual(400);
      expect(status, label).toBeLessThan(500);
    }

    const { data: got } = await ownerApi.payment.getRestrictedAiModels();
    expect(
      got.response?.models,
      "every rejected attempt above left the prior valid state untouched",
    ).toEqual([modelId]);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  // The one shape that does NOT get the 4xx its siblings above get: a `null`
  // array element is accepted (200) rather than rejected, and — because it is
  // filtered out during deserialization — the request is then processed as an
  // empty array, silently CLEARING whatever was restricted before. Every other
  // wrong-typed element (`123`, `true`, `{}`) correctly 400s instead.
  //
  // Filed as BUG XXXXX: the failure mode is "your restrictions got cleared
  // with no error", not corruption or a crash, but it is still a validation
  // gap — `[null]` should be rejected the same way `[123]`/`[true]`/`[{}]` are.
  test("BUG XXXXX: PUT /api/2.0/portal/payment/ai-model/restrictions - a null array element is accepted and silently clears the list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [modelId] = await liveModelIds(apiSdk, 1);

    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set([modelId]) },
    });

    const { status } = await rawRestrictionsCall(apiSdk, "owner", "put", {
      models: [null],
    });
    const { data: got } = await ownerApi.payment.getRestrictedAiModels();

    test.fail();
    expect(
      { status, models: got.response?.models },
      "[null] should 400 like its sibling wrong-typed elements and leave the " +
        "prior list untouched, not be accepted and wipe it",
    ).toEqual({ status: 400, models: [modelId] });
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - DocSpaceAdmin sets one restricted model (regression: used to 500)", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [modelId] = await liveModelIds(apiSdk, 1);
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: { models: new Set([modelId]) },
      });

    expect(status).toBe(200);
    expect(data.response?.models).toEqual([modelId]);

    await apiSdk.authenticateOwner();
    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - DocSpaceAdmin sets multiple restricted models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const [a, b] = await liveModelIds(apiSdk, 2);
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.setRestrictedAiModels({
        setRestrictedAiModelsRequestDto: { models: new Set([a, b]) },
      });

    expect(status).toBe(200);
    expect(data.response?.models?.slice().sort()).toEqual([a, b].sort());

    await apiSdk.authenticateOwner();
    await ownerApi.payment.setRestrictedAiModels({
      setRestrictedAiModelsRequestDto: { models: new Set() },
    });
  });

  test("PUT /api/2.0/portal/payment/ai-model/restrictions - DocSpaceAdmin clears restricted AI models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
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
        serviceName: ["ai-tools"],
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
          serviceName: ["ai-tools"],
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
        serviceName: ["ai-tools"],
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

test.describe("POST /api/2.0/portal/payment/customer/usage/monthly/report", () => {
  test("POST /api/2.0/portal/payment/customer/usage/monthly/report - Owner creates monthly usage report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.createCustomerMonthlyUsageReport({
        customerMonthlyUsageReportRequestDto: { startDate, endDate },
      });

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response?.id).toBe("string");
    expect(data.response!.id!.length).toBeGreaterThan(0);
    expect(data.response!.error).toBe("");
    expect(data.response!.isCompleted).toBe(false);
    expect(data.response!.status).toBe(0);
    expect(data.response!.percentage).toBe(0);
    expect(data.response!.resultFileUrl).toBe("");
  });

  test("POST /api/2.0/portal/payment/customer/usage/monthly/report - DocSpaceAdmin creates monthly usage report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerMonthlyUsageReport({
        customerMonthlyUsageReportRequestDto: { startDate, endDate },
      });

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response?.id).toBe("string");
    expect(data.response!.id!.length).toBeGreaterThan(0);
    expect(data.response!.error).toBe("");
    expect(data.response!.isCompleted).toBe(false);
    expect(data.response!.status).toBe(0);
    expect(data.response!.percentage).toBe(0);
    expect(data.response!.resultFileUrl).toBe("");
  });
});

test.describe("GET /api/2.0/portal/payment/customer/usage/monthly/report", () => {
  test("GET /api/2.0/portal/payment/customer/usage/monthly/report - Owner polls report until completed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk.forRole("owner").payment.createCustomerMonthlyUsageReport({
      customerMonthlyUsageReportRequestDto: { startDate, endDate },
    });

    let report: any;

    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .payment.getCustomerMonthlyUsageReport();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBe("");
      report = data.response;
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 60000 });

    expect(report.percentage).toBe(100);
    expect(report.status).toBe(2);
    expect(report.resultFileId).toBeGreaterThan(0);
    expect(typeof report.resultFileName).toBe("string");
    expect(report.resultFileName).toMatch(/\.xlsx$/);
    expect(report.resultFileUrl).toContain("/doceditor?fileid=");
  });

  test("GET /api/2.0/portal/payment/customer/usage/monthly/report - DocSpaceAdmin polls report until completed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerMonthlyUsageReport({
        customerMonthlyUsageReportRequestDto: { startDate, endDate },
      });

    let report: any;

    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .payment.getCustomerMonthlyUsageReport();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBe("");
      report = data.response;
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 60000 });

    expect(report.percentage).toBe(100);
    expect(report.status).toBe(2);
    expect(report.resultFileId).toBeGreaterThan(0);
    expect(typeof report.resultFileName).toBe("string");
    expect(report.resultFileName).toMatch(/\.xlsx$/);
    expect(report.resultFileUrl).toContain("/doceditor?fileid=");
  });
});

test.describe("DELETE /api/2.0/portal/payment/customer/usage/monthly/report", () => {
  test("DELETE /api/2.0/portal/payment/customer/usage/monthly/report - Owner terminates monthly report generation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk.forRole("owner").payment.createCustomerMonthlyUsageReport({
      customerMonthlyUsageReportRequestDto: { startDate, endDate },
    });

    const { status } = await apiSdk
      .forRole("owner")
      .payment.terminateCustomerMonthlyUsageReport();

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/portal/payment/customer/usage/monthly/report - DocSpaceAdmin terminates monthly report generation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerMonthlyUsageReport({
        customerMonthlyUsageReportRequestDto: { startDate, endDate },
      });

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.terminateCustomerMonthlyUsageReport();

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/portal/payment/customer/usage/monthly/report - DocSpaceAdmin terminates Owner's monthly report generation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk.forRole("owner").payment.createCustomerMonthlyUsageReport({
      customerMonthlyUsageReportRequestDto: { startDate, endDate },
    });

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.terminateCustomerMonthlyUsageReport();

    expect(status).toBe(200);
  });
});

test.describe("POST /api/2.0/portal/payment/customer/usage/report", () => {
  test("POST /api/2.0/portal/payment/customer/usage/report - Owner creates service usage report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.createCustomerServiceUsageReport({
        customerServiceUsageReportRequestDto: { startDate, endDate },
      });

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response?.id).toBe("string");
    expect(data.response!.id!.length).toBeGreaterThan(0);
    expect(data.response!.error).toBe("");
    expect(data.response!.isCompleted).toBe(false);
    expect(data.response!.status).toBe(0);
    expect(data.response!.percentage).toBe(0);
    expect(data.response!.resultFileUrl).toBe("");
  });

  test("POST /api/2.0/portal/payment/customer/usage/report - DocSpaceAdmin creates service usage report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerServiceUsageReport({
        customerServiceUsageReportRequestDto: { startDate, endDate },
      });

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response?.id).toBe("string");
    expect(data.response!.id!.length).toBeGreaterThan(0);
    expect(data.response!.error).toBe("");
    expect(data.response!.isCompleted).toBe(false);
    expect(data.response!.status).toBe(0);
    expect(data.response!.percentage).toBe(0);
    expect(data.response!.resultFileUrl).toBe("");
  });
});

test.describe("GET /api/2.0/portal/payment/customer/usage/report", () => {
  test("GET /api/2.0/portal/payment/customer/usage/report - Owner polls report until completed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk.forRole("owner").payment.createCustomerServiceUsageReport({
      customerServiceUsageReportRequestDto: { startDate, endDate },
    });

    let report: any;

    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .payment.getCustomerServiceUsageReport();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBe("");
      report = data.response;
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 60000 });

    expect(report.percentage).toBe(100);
    expect(report.status).toBe(2);
    expect(report.resultFileId).toBeGreaterThan(0);
    expect(report.resultFileName).toMatch(/\.xlsx$/);
    expect(report.resultFileUrl).toContain("/doceditor?fileid=");
  });

  test("GET /api/2.0/portal/payment/customer/usage/report - DocSpaceAdmin polls report until completed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerServiceUsageReport({
        customerServiceUsageReportRequestDto: { startDate, endDate },
      });

    let report: any;

    await expect(async () => {
      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .payment.getCustomerServiceUsageReport();
      expect(status).toBe(200);
      expect(data.response!.isCompleted).toBe(true);
      expect(data.response!.error).toBe("");
      report = data.response;
    }).toPass({ intervals: [2000, 3000, 5000], timeout: 60000 });

    expect(report.percentage).toBe(100);
    expect(report.status).toBe(2);
    expect(report.resultFileId).toBeGreaterThan(0);
    expect(report.resultFileName).toMatch(/\.xlsx$/);
    expect(report.resultFileUrl).toContain("/doceditor?fileid=");
  });
});

test.describe("DELETE /api/2.0/portal/payment/customer/usage/report", () => {
  test("DELETE /api/2.0/portal/payment/customer/usage/report - Owner terminates service usage report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk.forRole("owner").payment.createCustomerServiceUsageReport({
      customerServiceUsageReportRequestDto: { startDate, endDate },
    });

    const { status } = await apiSdk
      .forRole("owner")
      .payment.terminateCustomerServiceUsageReport();

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/portal/payment/customer/usage/report - DocSpaceAdmin terminates service usage report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk
      .forRole("docSpaceAdmin")
      .payment.createCustomerServiceUsageReport({
        customerServiceUsageReportRequestDto: { startDate, endDate },
      });

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.terminateCustomerServiceUsageReport();

    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/portal/payment/customer/usage/report - DocSpaceAdmin terminates Owner's service usage report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const now = new Date();
    const startDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
    ).toISOString();
    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    ).toISOString();

    await apiSdk.forRole("owner").payment.createCustomerServiceUsageReport({
      customerServiceUsageReportRequestDto: { startDate, endDate },
    });

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.terminateCustomerServiceUsageReport();

    expect(status).toBe(200);
  });
});

test.describe("GET /api/2.0/portal/payment/customer/usage/monthly", () => {
  test("GET /api/2.0/portal/payment/customer/usage/monthly - Owner gets monthly usage list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getCustomerMonthlyUsage({});

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect((data.response as any[]).length).toBeGreaterThan(0);

    const row = (data.response as any[])[0];
    expect(typeof row.year).toBe("number");
    expect(typeof row.month).toBe("number");
    expect(row.month).toBeGreaterThanOrEqual(1);
    expect(row.month).toBeLessThanOrEqual(12);
    expect(row.currency).toBe("USD");
    expect(typeof row.totalAmount).toBe("number");
    expect(typeof row.operationCount).toBe("number");
  });

  test("GET /api/2.0/portal/payment/customer/usage/monthly - DocSpaceAdmin gets monthly usage list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCustomerMonthlyUsage({});

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect((data.response as any[]).length).toBeGreaterThan(0);

    const row = (data.response as any[])[0];
    expect(typeof row.year).toBe("number");
    expect(typeof row.month).toBe("number");
    expect(row.month).toBeGreaterThanOrEqual(1);
    expect(row.month).toBeLessThanOrEqual(12);
    expect(row.currency).toBe("USD");
    expect(typeof row.totalAmount).toBe("number");
    expect(typeof row.operationCount).toBe("number");
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

  test("POST /api/2.0/portal/payment/deposit - Returns error for zero amount", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { status } = await apiSdk.forRole("owner").payment.topUpDeposit({
      topUpDepositRequestDto: { amount: 0, currency: "USD" },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/portal/payment/deposit - Returns error for negative amount", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { status } = await apiSdk.forRole("owner").payment.topUpDeposit({
      topUpDepositRequestDto: { amount: -100, currency: "USD" },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/portal/payment/deposit - Returns error for invalid currency", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { status } = await apiSdk.forRole("owner").payment.topUpDeposit({
      topUpDepositRequestDto: { amount: 100, currency: "INVALID" },
    });

    expect(status).toBe(400);
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

test.describe("GET /api/2.0/portal/payment/subscription/balance", () => {
  test("GET /api/2.0/portal/payment/subscription/balance - Owner gets 402 in test environment (no real Stripe subscription)", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // setupPayment() calls setdspsaaspaid — an internal API that marks the portal
    // as paid without creating a real Stripe subscription. getSubscriptionBalanceInfo
    // requires an actual Stripe subscription_id and returns 402 when none exists.
    await paymentsApi.setupPayment();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getSubscriptionBalanceInfo();

    expect(status).toBe(402);
    expect((data as any)?.error?.message).toContain(
      "no Stripe subscription id found",
    );
  });
});

test.describe("POST /api/2.0/portal/payment/subscription/movetowallet", () => {
  test("POST /api/2.0/portal/payment/subscription/movetowallet - Owner gets 403 in test environment (no real Stripe subscription)", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Requires a real Stripe subscription. setupPayment() uses setdspsaaspaid bypass
    // which does not create a Stripe subscription, so the endpoint returns 403.
    await paymentsApi.setupPayment();

    const { status } = await apiSdk
      .forRole("owner")
      .payment.moveSubscriptionToWallet({
        quantityRequestDto: { quantity: { admin: 1 } },
      });

    expect(status).toBe(403);
  });
});
