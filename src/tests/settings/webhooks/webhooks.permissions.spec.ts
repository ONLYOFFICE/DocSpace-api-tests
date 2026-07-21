import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

// Webhooks are managed per-user: every authenticated member (owner, DocSpace
// admin, room admin, user) can create and list their own webhooks. Guests are
// forbidden, and anonymous requests are unauthorized.
const webhookDto = (apiSdk: {
  faker: { generateString(n: number): string };
}) => ({
  createWebhooksConfigRequestsDto: {
    name: apiSdk.faker.generateString(10),
    uri: `https://example.com/?id=${apiSdk.faker.generateString(10)}`,
    secretKey: apiSdk.faker.generateString(20),
  },
});

test.describe("POST /api/2.0/settings/webhook - permissions", () => {
  test("POST /api/2.0/settings/webhook - Anonymous cannot create a webhook", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .webhooks.createWebhook(webhookDto(apiSdk));

    expect(status).toBe(401);
  });

  test("POST /api/2.0/settings/webhook - RoomAdmin can create a webhook", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await api.webhooks.createWebhook(
      webhookDto(apiSdk),
    );

    expect(status).toBe(200);
    expect(data.response?.id).toBeDefined();
  });

  test("POST /api/2.0/settings/webhook - User can create a webhook", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await api.webhooks.createWebhook(
      webhookDto(apiSdk),
    );

    expect(status).toBe(200);
    expect(data.response?.id).toBeDefined();
  });

  test("POST /api/2.0/settings/webhook - Guest cannot create a webhook", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await api.webhooks.createWebhook(
      webhookDto(apiSdk),
    );

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/settings/webhook - permissions", () => {
  test("GET /api/2.0/settings/webhook - Anonymous cannot get webhooks", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().webhooks.getTenantWebhooks();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/webhook - RoomAdmin can get webhooks", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await api.webhooks.getTenantWebhooks();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/settings/webhook - User can get webhooks", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await api.webhooks.getTenantWebhooks();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/settings/webhook - Guest cannot get webhooks", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await api.webhooks.getTenantWebhooks();

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/settings/webhooks/log - permissions", () => {
  test("GET /api/2.0/settings/webhooks/log - Anonymous cannot get webhook logs", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().webhooks.getWebhooksLogs({});

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/webhooks/log - Guest cannot get webhook logs", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await api.webhooks.getWebhooksLogs({});

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/settings/webhook/triggers - permissions", () => {
  // Unlike the other endpoints, the triggers list is available to guests too.
  test("GET /api/2.0/settings/webhook/triggers - Guest can get webhook triggers", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await api.webhooks.getWebhookTriggers();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});
