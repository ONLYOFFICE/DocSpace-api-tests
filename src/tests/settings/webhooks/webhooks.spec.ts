import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { WebhookTrigger } from "@onlyoffice/docspace-api-sdk";

// NOTE: the backend validates the webhook URL by sending a HEAD request and
// requires an HTTP 200 response, so the target must be a real, reachable URL.
const webhookUri = (apiSdk: { faker: { generateString(n: number): string } }) =>
  `https://example.com/?id=${apiSdk.faker.generateString(10)}`;

// NOTE: secretKey is required by the backend on create/update even though the
// SDK type marks it optional; omitting it returns 400.
const webhookDto = (apiSdk: {
  faker: { generateString(n: number): string };
}) => ({
  name: apiSdk.faker.generateString(10),
  uri: webhookUri(apiSdk),
  secretKey: apiSdk.faker.generateString(20),
});

test.describe("POST /api/2.0/settings/webhook - Create a webhook", () => {
  test("POST /api/2.0/settings/webhook - Owner creates a webhook", async ({
    apiSdk,
  }) => {
    const dto = webhookDto(apiSdk);

    const { data, status } = await apiSdk
      .forRole("owner")
      .webhooks.createWebhook({
        createWebhooksConfigRequestsDto: { ...dto, enabled: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.id).toBe("number");
    expect(data.response?.name).toBe(dto.name);
    expect(data.response?.uri).toBe(dto.uri);
    expect(data.response?.enabled).toBe(true);
    expect((data.response as any)?.secretKey).toBeUndefined();
    expect(data.response?.createdBy?.id).toBeDefined();
    expect(data.response?.createdOn).toBeDefined();
  });

  test("POST /api/2.0/settings/webhook - Owner creates a webhook with triggers and ssl", async ({
    apiSdk,
  }) => {
    const dto = webhookDto(apiSdk);

    const { data, status } = await apiSdk
      .forRole("owner")
      .webhooks.createWebhook({
        createWebhooksConfigRequestsDto: {
          ...dto,
          ssl: true,
          triggers: WebhookTrigger.FileCreated,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.ssl).toBe(true);
    expect(data.response?.triggers).toBe(WebhookTrigger.FileCreated);
  });
});

test.describe("GET /api/2.0/settings/webhook - Get tenant webhooks", () => {
  test("GET /api/2.0/settings/webhook - Owner gets the created webhook in the list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const dto = webhookDto(apiSdk);

    const { data: created } = await ownerApi.webhooks.createWebhook({
      createWebhooksConfigRequestsDto: dto,
    });
    const createdId = created.response!.id!;

    const { data, status } = await ownerApi.webhooks.getTenantWebhooks();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    const found = data.response?.find((w) => w.configs?.id === createdId);
    expect(found).toBeDefined();
    expect(found?.configs?.name).toBe(dto.name);
    expect(found?.configs?.uri).toBe(dto.uri);
  });
});

test.describe("PUT /api/2.0/settings/webhook - Update a webhook", () => {
  test("PUT /api/2.0/settings/webhook - Owner updates a webhook name and uri", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: created } = await ownerApi.webhooks.createWebhook({
      createWebhooksConfigRequestsDto: webhookDto(apiSdk),
    });
    const id = created.response!.id!;

    const updated = webhookDto(apiSdk);

    const { data, status } = await ownerApi.webhooks.updateWebhook({
      updateWebhooksConfigRequestsDto: { id, ...updated },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(id);
    expect(data.response?.name).toBe(updated.name);
    expect(data.response?.uri).toBe(updated.uri);
    expect(data.response?.modifiedOn).toBeDefined();
  });
});

test.describe("PUT /api/2.0/settings/webhook/enable - Enable a webhook", () => {
  test("PUT /api/2.0/settings/webhook/enable - Owner toggles a webhook enabled state", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const dto = webhookDto(apiSdk);

    const { data: created } = await ownerApi.webhooks.createWebhook({
      createWebhooksConfigRequestsDto: { ...dto, enabled: true },
    });
    const id = created.response!.id!;

    const { data, status } = await ownerApi.webhooks.enableWebhook({
      updateWebhooksConfigRequestsDto: { id, ...dto, enabled: false },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(id);
    expect(data.response?.name).toBe(dto.name);
    expect(data.response?.uri).toBe(dto.uri);
    expect(data.response?.enabled).toBe(false);
    expect(data.response?.modifiedOn).toBeDefined();
  });
});

test.describe("DELETE /api/2.0/settings/webhook/{id} - Remove a webhook", () => {
  test("DELETE /api/2.0/settings/webhook/{id} - Owner removes a webhook", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: created } = await ownerApi.webhooks.createWebhook({
      createWebhooksConfigRequestsDto: webhookDto(apiSdk),
    });
    const id = created.response!.id!;

    const { data, status } = await ownerApi.webhooks.removeWebhook({ id });
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.id).toBe(id);

    const { data: list } = await ownerApi.webhooks.getTenantWebhooks();
    const found = list.response?.find((w) => w.configs?.id === id);
    expect(found).toBeUndefined();
  });
});

test.describe("GET /api/2.0/settings/webhook/triggers - Get webhook triggers", () => {
  test("GET /api/2.0/settings/webhook/triggers - Owner gets the list of available triggers", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .webhooks.getWebhookTriggers();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
    expect(data.response!.length).toBeGreaterThan(0);
    expect(data.response![0].name).toBeDefined();
    expect(typeof data.response![0].id).toBe("number");
  });
});

test.describe("GET /api/2.0/settings/webhooks/log - Get webhook logs", () => {
  test("GET /api/2.0/settings/webhooks/log - Owner gets webhook logs", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .webhooks.getWebhooksLogs({ count: 10 });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("PUT /api/2.0/settings/webhook/retry - Retry webhooks", () => {
  test("PUT /api/2.0/settings/webhook/retry - Owner retries webhooks with an empty id list", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .webhooks.retryWebhooks({ webhookRetryRequestsDto: { ids: [] } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});
