import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

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
  test("GET /api/2.0/settings/webhook/triggers - Guest can get webhook triggers", async ({
    apiSdk,
  }) => {
    const { api } = await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await api.webhooks.getWebhookTriggers();

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("Webhook ownership - a non-admin cannot modify another user's webhook", () => {
  test("PUT /api/2.0/settings/webhook/enable - User A cannot enable/disable User B's webhook", async ({
    apiSdk,
  }) => {
    const a = await apiSdk.addMember("owner", "User");
    const b = await apiSdk.addMember("owner", "User");
    const apiA = await apiSdk.authenticateMember(a.userData, "User");
    const apiB = await apiSdk.authenticateMember(b.userData, "User");

    const dtoB = webhookDto(apiSdk);
    const { data: created } = await apiB.webhooks.createWebhook(dtoB);
    const id = created.response!.id!;

    const { data, status } = await apiA.webhooks.enableWebhook({
      updateWebhooksConfigRequestsDto: {
        id,
        ...dtoB.createWebhooksConfigRequestsDto,
        enabled: false,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/settings/webhook/{id} - User A cannot remove User B's webhook", async ({
    apiSdk,
  }) => {
    const a = await apiSdk.addMember("owner", "User");
    const b = await apiSdk.addMember("owner", "User");
    const apiA = await apiSdk.authenticateMember(a.userData, "User");
    const apiB = await apiSdk.authenticateMember(b.userData, "User");

    const { data: created } = await apiB.webhooks.createWebhook(
      webhookDto(apiSdk),
    );
    const id = created.response!.id!;

    const { data, status } = await apiA.webhooks.removeWebhook({ id });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe("Access denied");

    const { data: listB } = await apiB.webhooks.getTenantWebhooks();
    expect(listB.response?.some((w) => w.configs?.id === id)).toBe(true);
  });
});
