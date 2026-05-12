import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

// Security tests based on white-hat report:
// backUrl parameter in PUT /api/2.0/portal/payment/url has no length or domain validation.
// Internally backUrl is mapped to successUrl inside the Stripe redirect URL.
// Risk 1: No length limit — should return 400 for excessively long URLs.
// Risk 2: No domain validation — open redirect after payment to arbitrary external domain.

const LONG_BACK_URL_18000 = "https://" + "evil".repeat(4497) + ".com"; // 18000 chars, exceeds nginx large_client_header_buffers 16k limit

const EXTERNAL_BACK_URL = "https://attacker.com/phishing";

test.describe("PUT /api/2.0/portal/payment/url - permissions", () => {
  test("PUT /api/2.0/portal/payment/url - Anonymous cannot get payment page URL", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.getPaymentUrl({
      paymentUrlRequestDto: { quantity: { admin: 1 } },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/portal/payment/url - RoomAdmin cannot get payment page URL", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: apiSdk.tokenStore.portalBaseUrl,
          quantity: { admin: 1 },
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/url - User cannot get payment page URL", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: apiSdk.tokenStore.portalBaseUrl,
          quantity: { admin: 1 },
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/url - Guest cannot get payment page URL", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: apiSdk.tokenStore.portalBaseUrl,
          quantity: { admin: 1 },
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/portal/payment/url - quantity validation", () => {
  test("BUG 81436: PUT /api/2.0/portal/payment/url - Owner cannot set quantity to 0", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: apiSdk.tokenStore.portalBaseUrl,
          quantity: { admin: 0 },
        },
      });

    expect(status).toBe(400);
    expect((data as any)?.error?.message).toBe("Invalid quantity");
  });

  test("PUT /api/2.0/portal/payment/url - Owner cannot set negative quantity", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: apiSdk.tokenStore.portalBaseUrl,
          quantity: { admin: -1 },
        },
      });

    expect(status).toBe(402);
    expect((data as any)?.error?.message).toBe(
      "The number of admins should not exceed -1",
    );
  });
});

test.describe("PUT /api/2.0/portal/payment/url - backUrl validation", () => {
  test("BUG 81433: PUT /api/2.0/portal/payment/url - Owner cannot set invalid backUrl format", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: { backUrl: "notaurl", quantity: { admin: 1 } },
      });
    expect(status).toBe(400);
    expect((data as any)?.response?.errors?.BackUrl[0]).toBe(
      "The BackUrl field is not a valid fully-qualified http, https, or ftp URL.",
    );
  });

  test("BUG 81434: PUT /api/2.0/portal/payment/url - Owner cannot set backUrl exceeding 18000 chars (nginx 16k limit)", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: LONG_BACK_URL_18000,
          quantity: { admin: 1 },
        },
      });

    expect(status).toBe(400);
    expect((data as any)?.response?.errors?.BackUrl[0]).toBe(
      "The field BackUrl must be a string with a maximum length of 255.",
    );
  });

  test("BUG 81433: PUT /api/2.0/portal/payment/url - Owner cannot set external domain as backUrl (open redirect)", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.getPaymentUrl({
        paymentUrlRequestDto: {
          backUrl: EXTERNAL_BACK_URL,
          quantity: { admin: 1 },
        },
      });

    expect(status).toBe(400);
    expect((data as any)?.error?.message).toBe("Invalid URI host");
  });
});

test.describe("POST /api/2.0/portal/payment/buywalletservice - permissions", () => {
  test("POST /api/2.0/portal/payment/buywalletservice - Anonymous cannot buy wallet service", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.buyWalletService({
      buyWalletServiceRequestDto: { quantity: 10, serviceName: "ai-tools" },
    });

    expect(status).toBe(401);
  });

  test("BUG 81442: POST /api/2.0/portal/payment/buywalletservice - RoomAdmin cannot buy wallet service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.buyWalletService({
        buyWalletServiceRequestDto: { quantity: 10, serviceName: "ai-tools" },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81442: POST /api/2.0/portal/payment/buywalletservice - User cannot buy wallet service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.buyWalletService({
        buyWalletServiceRequestDto: { quantity: 10, serviceName: "ai-tools" },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("BUG 81442: POST /api/2.0/portal/payment/buywalletservice - Guest cannot buy wallet service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.buyWalletService({
        buyWalletServiceRequestDto: { quantity: 10, serviceName: "ai-tools" },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/payment/buywalletservice - DocSpaceAdmin cannot buy wallet service when Owner is already the payer", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.buyWalletService({
        buyWalletServiceRequestDto: { quantity: 10, serviceName: "ai-tools" },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/portal/payment/updatewallet - permissions", () => {
  test("PUT /api/2.0/portal/payment/updatewallet - DocSpaceAdmin cannot update wallet payment", async ({
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

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/updatewallet - RoomAdmin cannot update wallet payment", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.updateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/updatewallet - User cannot update wallet payment", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.updateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/updatewallet - Guest cannot update wallet payment", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.updateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/updatewallet - Anonymous cannot update wallet payment", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 100 },
        productQuantityType: 1,
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/portal/payment/calculatewallet - permissions", () => {
  test("PUT /api/2.0/portal/payment/calculatewallet - Anonymous cannot calculate wallet payment", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/portal/payment/calculatewallet - DocSpaceAdmin cannot calculate wallet payment when Owner is already the payer", async ({
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

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/calculatewallet - RoomAdmin cannot calculate wallet payment", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/calculatewallet - User cannot calculate wallet payment", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/calculatewallet - Guest cannot calculate wallet payment", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/portal/payment/calculatewallet - permissions when storage is disabled", () => {
  test("PUT /api/2.0/portal/payment/calculatewallet - DocSpaceAdmin cannot calculate wallet payment when storage is disabled", async ({
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
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 0 },
        productQuantityType: 0,
      },
    });
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/calculatewallet - RoomAdmin cannot calculate wallet payment when storage is disabled", async ({
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
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 0 },
        productQuantityType: 0,
      },
    });
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/calculatewallet - User cannot calculate wallet payment when storage is disabled", async ({
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
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 0 },
        productQuantityType: 0,
      },
    });
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("PUT /api/2.0/portal/payment/calculatewallet - Guest cannot calculate wallet payment when storage is disabled", async ({
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
    await apiSdk.forRole("owner").payment.updateWalletPayment({
      walletQuantityRequestDto: {
        quantity: { storage: 0 },
        productQuantityType: 0,
      },
    });
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.calculateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: 100 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("PUT /api/2.0/portal/payment/updatewallet - storage validation", () => {
  test("PUT /api/2.0/portal/payment/updatewallet - Owner cannot set negative storage value", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.updateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: -1 },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(400);
    expect((data as any)?.error?.message).toBe("Invalid quantity");
  });

  test("PUT /api/2.0/portal/payment/updatewallet - Owner cannot set string as storage value", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.updateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: "abc" as any },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(400);
    expect(
      (data as any)?.response?.errors?.["$.quantity.storage"][0],
    ).toContain("The JSON value could not be converted to");
  });

  test("PUT /api/2.0/portal/payment/updatewallet - Owner cannot set special characters as storage value", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.updateWalletPayment({
        walletQuantityRequestDto: {
          quantity: { storage: "!@#$%" as any },
          productQuantityType: 1,
        },
      });

    expect(status).toBe(400);
    expect(
      (data as any)?.response?.errors?.["$.quantity.storage"][0],
    ).toContain("The JSON value could not be converted to");
  });
});

test.describe("POST /api/2.0/portal/payment/buywalletservice - service validation", () => {
  test("BUG 81443: POST /api/2.0/portal/payment/buywalletservice - Owner cannot buy non-existent service", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();

    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.buyWalletService({
        buyWalletServiceRequestDto: {
          quantity: 1,
          serviceName: "non-existent-service",
        },
      });

    expect(status).toBe(404);
    expect((data as any)?.error?.message).toBe("Service could not be found");
  });
});

test.describe("POST /api/2.0/portal/payment/servicestate - permissions", () => {
  test("POST /api/2.0/portal/payment/servicestate - Anonymous cannot change wallet service state", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: { service: -13, enabled: true },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/portal/payment/servicestate - DocSpaceAdmin cannot change wallet service state", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: { service: -13, enabled: true },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/payment/servicestate - RoomAdmin cannot change wallet service state", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: { service: -13, enabled: true },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/payment/servicestate - User cannot change wallet service state", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: { service: -13, enabled: true },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/payment/servicestate - Guest cannot change wallet service state", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.changeTenantWalletServiceState({
        changeWalletServiceStateRequestDto: { service: -13, enabled: true },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/customer/operations - permissions", () => {
  test("GET /api/2.0/portal/payment/customer/operations - Anonymous cannot get customer operations", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getCustomerOperations();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/customer/operations - RoomAdmin cannot get customer operations", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getCustomerOperations();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customer/operations - User cannot get customer operations", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getCustomerOperations();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customer/operations - Guest cannot get customer operations", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getCustomerOperations();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/portal/payment/customer/operationsreport - permissions", () => {
  test("POST /api/2.0/portal/payment/customer/operationsreport - Anonymous cannot create operations report", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "ai-tools",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/portal/payment/customer/operationsreport - RoomAdmin cannot create operations report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "ai-tools",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/payment/customer/operationsreport - User cannot create operations report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "ai-tools",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/payment/customer/operationsreport - Guest cannot create operations report", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.createCustomerOperationsReport({
        customerOperationsReportRequestDto: {
          serviceName: "ai-tools",
          credit: true,
          debit: true,
        },
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/customer/operationsreport - permissions", () => {
  test("GET /api/2.0/portal/payment/customer/operationsreport - Anonymous cannot get report generation status", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getCustomerOperationsReport();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/customer/operationsreport - RoomAdmin cannot get report generation status", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getCustomerOperationsReport();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customer/operationsreport - User cannot get report generation status", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getCustomerOperationsReport();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customer/operationsreport - Guest cannot get report generation status", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getCustomerOperationsReport();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/currencies - permissions", () => {
  test("GET /api/2.0/portal/payment/currencies - Anonymous cannot get payment currencies", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getPaymentCurrencies();

    expect(status).toBe(401);
  });

  test.fail(
    "BUG 81512: GET /api/2.0/portal/payment/currencies - RoomAdmin cannot get payment currencies",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .payment.getPaymentCurrencies();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );

  test.fail(
    "BUG 81512: GET /api/2.0/portal/payment/currencies - User cannot get payment currencies",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");

      const { data, status } = await apiSdk
        .forRole("user")
        .payment.getPaymentCurrencies();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );

  test.fail(
    "BUG 81512: GET /api/2.0/portal/payment/currencies - Guest cannot get payment currencies",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { data, status } = await apiSdk
        .forRole("guest")
        .payment.getPaymentCurrencies();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );
});

test.describe("GET /api/2.0/portal/payment/account - permissions", () => {
  test("GET /api/2.0/portal/payment/account - Anonymous cannot get payment account URL", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.getPaymentAccount();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/account - DocSpaceAdmin cannot get payment account URL", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getPaymentAccount({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/account - RoomAdmin cannot get payment account URL", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getPaymentAccount({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/account - User cannot get payment account URL", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getPaymentAccount({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/account - Guest cannot get payment account URL", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getPaymentAccount({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/customer/servicequota - permissions", () => {
  test("GET /api/2.0/portal/payment/customer/servicequota - Anonymous cannot get service quota", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getCustomerServiceQuota({ serviceName: "ai-tools" });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/customer/servicequota - RoomAdmin cannot get service quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getCustomerServiceQuota({ serviceName: "ai-tools" });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customer/servicequota - User cannot get service quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getCustomerServiceQuota({ serviceName: "ai-tools" });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customer/servicequota - Guest cannot get service quota", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getCustomerServiceQuota({ serviceName: "ai-tools" });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/customerinfo - permissions", () => {
  test("GET /api/2.0/portal/payment/customerinfo - Anonymous cannot get customer info", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.getCustomerInfo();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/customerinfo - RoomAdmin cannot get customer info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getCustomerInfo();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customerinfo - User cannot get customer info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getCustomerInfo();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customerinfo - Guest cannot get customer info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getCustomerInfo();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/customer/balance - permissions", () => {
  test("GET /api/2.0/portal/payment/customer/balance - Anonymous cannot get customer balance", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.getCustomerBalance();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/customer/balance - RoomAdmin cannot get customer balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getCustomerBalance();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customer/balance - User cannot get customer balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getCustomerBalance();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/customer/balance - Guest cannot get customer balance", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getCustomerBalance();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/checkoutsetupurl - permissions", () => {
  test("GET /api/2.0/portal/payment/checkoutsetupurl - Anonymous cannot get checkout setup URL", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getCheckoutSetupUrl();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/checkoutsetupurl - DocSpaceAdmin cannot get checkout setup URL", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .payment.getCheckoutSetupUrl({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/checkoutsetupurl - RoomAdmin cannot get checkout setup URL", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getCheckoutSetupUrl({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/checkoutsetupurl - User cannot get checkout setup URL", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getCheckoutSetupUrl({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/checkoutsetupurl - Guest cannot get checkout setup URL", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getCheckoutSetupUrl({
        backUrl: apiSdk.tokenStore.portalBaseUrl,
      });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/portal/payment/request - permissions", () => {
  const SALES_REQUEST = {
    userName: "nctTest",
    email: "nct@email.com",
    message: "autoTest",
  };

  test("POST /api/2.0/portal/payment/request - Anonymous cannot send payment request", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.sendPaymentRequest({ salesRequestsDto: SALES_REQUEST });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/portal/payment/request - RoomAdmin cannot send payment request", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.sendPaymentRequest({ salesRequestsDto: SALES_REQUEST });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/payment/request - User cannot send payment request", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.sendPaymentRequest({ salesRequestsDto: SALES_REQUEST });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/payment/request - Guest cannot send payment request", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.sendPaymentRequest({ salesRequestsDto: SALES_REQUEST });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/portal/payment/request - string length validation", () => {
  test("POST /api/2.0/portal/payment/request - Owner cannot send request with userName exceeding 255 chars", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.sendPaymentRequest({
        salesRequestsDto: {
          userName: "a".repeat(256),
          email: "nct@email.com",
          message: "autoTest",
        },
      });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.UserName[0]).toBe(
      "The field UserName must be a string or array type with a maximum length of '255'.",
    );
  });

  test("POST /api/2.0/portal/payment/request - Owner cannot send request with email exceeding 64 chars", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.sendPaymentRequest({
        salesRequestsDto: {
          userName: "nctTest",
          email: "a".repeat(55) + "@email.com",
          message: "autoTest",
        },
      });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.Email[0]).toBe(
      "The field Email must be a string or array type with a maximum length of '64'.",
    );
  });

  test("POST /api/2.0/portal/payment/request - Owner cannot send request with message exceeding 255 chars", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.sendPaymentRequest({
        salesRequestsDto: {
          userName: "nctTest",
          email: "nct@email.com",
          message: "a".repeat(256),
        },
      });

    expect(status).toBe(400);
    expect((data as any).response?.errors?.Message[0]).toBe(
      "The field Message must be a string or array type with a maximum length of '255'.",
    );
  });
});

test.describe("POST /api/2.0/portal/payment/request - empty field validation", () => {
  test.fail(
    "BUG : POST /api/2.0/portal/payment/request - Owner cannot send request with empty userName",
    async ({ apiSdk }) => {
      const { data, status } = await apiSdk
        .forRole("owner")
        .payment.sendPaymentRequest({
          salesRequestsDto: {
            userName: "",
            email: "nct@email.com",
            message: "autoTest",
          },
        });

      expect(status).toBe(400);
      expect((data as any).error?.message).toBe("Incorrect user name");
    },
  );

  test("POST /api/2.0/portal/payment/request - Owner cannot send request with empty email", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.sendPaymentRequest({
        salesRequestsDto: {
          userName: "nctTest",
          email: "",
          message: "autoTest",
        },
      });

    expect(status).toBe(400);
    expect((data as any).error?.message).toBe("Incorrect email");
  });

  test("POST /api/2.0/portal/payment/request - Owner cannot send request with empty message", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .payment.sendPaymentRequest({
        salesRequestsDto: {
          userName: "nctTest",
          email: "nct@email.com",
          message: "",
        },
      });

    expect(status).toBe(400);
    expect((data as any).error?.message).toBe("Message text is empty");
  });
});

test.describe("GET /api/2.0/portal/payment/walletservices - permissions", () => {
  test("GET /api/2.0/portal/payment/walletservices - Anonymous cannot get wallet services", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.getWalletServices();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/walletservices - RoomAdmin cannot get wallet services", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getWalletServices();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/walletservices - User cannot get wallet services", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getWalletServices();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/walletservices - Guest cannot get wallet services", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getWalletServices();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/walletservice - permissions", () => {
  test("GET /api/2.0/portal/payment/walletservice - Anonymous cannot get wallet service info", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getWalletService({ service: -13 });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/walletservice - RoomAdmin cannot get wallet service info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getWalletService({ service: -13 });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/walletservice - User cannot get wallet service info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getWalletService({ service: -13 });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/walletservice - Guest cannot get wallet service info", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getWalletService({ service: -13 });

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/topupsettings - permissions", () => {
  test("GET /api/2.0/portal/payment/topupsettings - Anonymous cannot get wallet top-up settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getTenantWalletSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/topupsettings - RoomAdmin cannot get wallet top-up settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getTenantWalletSettings();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/topupsettings - User cannot get wallet top-up settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getTenantWalletSettings();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/topupsettings - Guest cannot get wallet top-up settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getTenantWalletSettings();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/servicessettings - permissions", () => {
  test("GET /api/2.0/portal/payment/servicessettings - Anonymous cannot get wallet services settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getTenantWalletServiceSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/servicessettings - RoomAdmin cannot get wallet services settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getTenantWalletServiceSettings();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/servicessettings - User cannot get wallet services settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getTenantWalletServiceSettings();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/servicessettings - Guest cannot get wallet services settings", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.makeWalletTopUp();
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getTenantWalletServiceSettings();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/ai-model/restrictions - permissions", () => {
  test("GET /api/2.0/portal/payment/ai-model/restrictions - Anonymous cannot get restricted AI models", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getRestrictedAiModels();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/ai-model/restrictions - RoomAdmin cannot get restricted AI models", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getRestrictedAiModels();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/ai-model/restrictions - User cannot get restricted AI models", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getRestrictedAiModels();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/ai-model/restrictions - Guest cannot get restricted AI models", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getRestrictedAiModels();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/quota - permissions", () => {
  test("GET /api/2.0/portal/payment/quota - Anonymous cannot get quota information", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .payment.getQuotaPaymentInformation();

    expect(status).toBe(401);
  });

  test.fail(
    "BUG 70912: GET /api/2.0/portal/payment/quota - RoomAdmin cannot get quota information",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .payment.getQuotaPaymentInformation();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );

  test.fail(
    "BUG 70912: GET /api/2.0/portal/payment/quota - User cannot get quota information",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");

      const { data, status } = await apiSdk
        .forRole("user")
        .payment.getQuotaPaymentInformation();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );

  test("GET /api/2.0/portal/payment/quota - Guest cannot get quota information", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getQuotaPaymentInformation();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/prices - permissions", () => {
  test("GET /api/2.0/portal/payment/prices - Anonymous cannot get portal prices", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.getPortalPrices();

    expect(status).toBe(401);
  });

  test.fail(
    "BUG 81516: GET /api/2.0/portal/payment/prices - RoomAdmin cannot get portal prices",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .payment.getPortalPrices();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );

  test.fail(
    "BUG 81516: GET /api/2.0/portal/payment/prices - User cannot get portal prices",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "User");

      const { data, status } = await apiSdk
        .forRole("user")
        .payment.getPortalPrices();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );

  test.fail(
    "BUG 81516: GET /api/2.0/portal/payment/prices - Guest cannot get portal prices",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { data, status } = await apiSdk
        .forRole("guest")
        .payment.getPortalPrices();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );
});

test.describe("GET /api/2.0/portal/payment/quotas - permissions", () => {
  test("GET /api/2.0/portal/payment/quotas - Anonymous cannot get payment quotas", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.getPaymentQuotas();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/quotas - RoomAdmin cannot get payment quotas", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getPaymentQuotas();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/quotas - User cannot get payment quotas", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .payment.getPaymentQuotas();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/quotas - Guest cannot get payment quotas", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getPaymentQuotas();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/payment/ai-prices - permissions", () => {
  test("GET /api/2.0/portal/payment/ai-prices - Anonymous cannot get AI prices", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().payment.getAiPrices();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/payment/ai-prices - RoomAdmin cannot get AI prices", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .payment.getAiPrices();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/ai-prices - User cannot get AI prices", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk.forRole("user").payment.getAiPrices();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("GET /api/2.0/portal/payment/ai-prices - Guest cannot get AI prices", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .payment.getAiPrices();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});
