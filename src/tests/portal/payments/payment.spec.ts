import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import {
  topUpDeposit,
  buyWalletService,
  enableWalletService,
  disableWalletService,
} from "@/src/helpers/wallet-services";

test.describe("GET /api/2.0/portal/payment/customer/operations", () => {
  test.fail(
    "BUG XXXXX: GET /api/2.0/portal/payment/customer/operations - Returns 200 after disabling Disk Storage service",
    async ({ apiSdk, paymentsApi }) => {
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
        serviceName: "disk-storage",
        startDate: startDate.toISOString().slice(0, 19),
        endDate: endDate.toISOString().slice(0, 19),
        credit: true,
        debit: true,
      });

      expect(status).toBe(200);
    },
  );
});
