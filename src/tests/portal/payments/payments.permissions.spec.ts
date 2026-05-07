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
        paymentUrlRequestDto: { quantity: { admin: 1 } },
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
        paymentUrlRequestDto: { quantity: { admin: 1 } },
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
        paymentUrlRequestDto: { quantity: { admin: 1 } },
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
        paymentUrlRequestDto: { quantity: { admin: 0 } },
      });

    expect(status).toBe(400);
    expect((data as any)?.response?.errors?.BackUrl[0]).toBe(
      "The BackUrl field is required.",
    );
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
