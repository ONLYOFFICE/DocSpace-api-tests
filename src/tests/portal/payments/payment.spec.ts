import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
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
        paymentUrlRequestDto: { quantity: { admin: 1 } },
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
        paymentUrlRequestDto: { quantity: { admin: 2 } },
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
  test("POST /api/2.0/portal/payment/buywalletservice - Owner buys Storage 100GB and enables service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const ownerApi = apiSdk.forRole("owner");
    await topUpDeposit(ownerApi.payment, 1000);

    const { status } = await buyWalletService(ownerApi.payment, "storage", 100);
    expect(status).toBe(200);
  });

  test("POST /api/2.0/portal/payment/buywalletservice - Owner buys ai-tools service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    const ownerApi = apiSdk.forRole("owner");
    await topUpDeposit(ownerApi.payment, 1000);

    const { status } = await ownerApi.payment.buyWalletService({
      buyWalletServiceRequestDto: { quantity: 1, serviceName: "ai-tools" },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/portal/payment/buywalletservice - DocSpaceAdmin buys Storage 100GB", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    await topUpDeposit(apiSdk.forRole("owner").payment, 1000);
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await buyWalletService(
      apiSdk.forRole("docSpaceAdmin").payment,
      "storage",
      100,
    );
    expect(status).toBe(200);
  });

  test("POST /api/2.0/portal/payment/buywalletservice - DocSpaceAdmin buys ai-tools service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();

    await topUpDeposit(apiSdk.forRole("owner").payment, 1000);
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.buyWalletService({
        buyWalletServiceRequestDto: { quantity: 1, serviceName: "ai-tools" },
      });

    expect(status).toBe(200);
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
