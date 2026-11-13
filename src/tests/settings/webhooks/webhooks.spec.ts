import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, WebhookTrigger } from "@onlyoffice/docspace-api-sdk";

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
        createWebhooksConfigRequestDto: { ...dto, enabled: true },
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
        createWebhooksConfigRequestDto: {
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
      createWebhooksConfigRequestDto: dto,
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
      createWebhooksConfigRequestDto: webhookDto(apiSdk),
    });
    const id = created.response!.id!;

    const updated = webhookDto(apiSdk);

    const { data, status } = await ownerApi.webhooks.updateWebhook({
      updateWebhooksConfigRequestDto: { id, ...updated },
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
      createWebhooksConfigRequestDto: { ...dto, enabled: true },
    });
    const id = created.response!.id!;

    const { data, status } = await ownerApi.webhooks.enableWebhook({
      updateWebhooksConfigRequestDto: { id, ...dto, enabled: false },
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
      createWebhooksConfigRequestDto: webhookDto(apiSdk),
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

  test("GET /api/2.0/settings/webhooks/log - The record of an event carries what was sent and the answer that came back", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const dto = webhookDto(apiSdk);
    const { data: created, status: createStatus } =
      await ownerApi.webhooks.createWebhook({
        createWebhooksConfigRequestDto: {
          ...dto,
          enabled: true,
          triggers: WebhookTrigger.RoomCreated,
        },
      });
    expect(createStatus).toBe(200);
    const configId = created.response!.id!;

    const title = `Autotest hook ${apiSdk.faker.generateString(8)}`;
    const { data: room, status: roomStatus } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
    });
    expect(roomStatus).toBe(200);
    const roomId = room.response!.id!;

    let records: {
      trigger?: number;
      requestPayload?: string | null;
      requestHeaders?: string | null;
      status?: number;
      delivery?: string | null;
    }[] = [];
    await expect(async () => {
      const { data } = await ownerApi.webhooks.getWebhooksLogs({
        configId,
        count: 10,
      });
      records = data.response ?? [];
      expect(records[0], "the room creation reached no delivery").toBeDefined();
      // The attempt is made behind the request, so wait until the receiver has
      // answered: the status is 0 while nothing has come back.
      expect(records[0].status).toBeGreaterThan(0);
    }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

    // Only the subscribed event was recorded; automatic retries update the
    // record in place rather than adding one.
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.trigger).toBe(WebhookTrigger.RoomCreated);

    // What left the portal: the entity the event is about, and the headers a
    // receiver authenticates the delivery with.
    expect(record.requestPayload).toContain(title);
    expect(record.requestPayload).toContain(String(roomId));
    const headers = (record.requestHeaders ?? "").toLowerCase();
    expect(headers).toContain("x-docspace-signature-256");
    expect(headers).toContain("x-docspace-event-id");

    // And what came back: the delivery moment is set when, and only when, the
    // receiver's own answer was a success, so a refused delivery is never
    // recorded as a delivered one.
    const answered = record.status!;
    expect(Boolean(record.delivery)).toBe(answered >= 200 && answered < 300);
  });
});

test.describe("PUT /api/2.0/settings/webhook/retry - Retry webhooks", () => {
  test("PUT /api/2.0/settings/webhook/retry - Owner retries webhooks with an empty id list", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .webhooks.retryWebhooks({ webhookRetryRequestDto: { ids: [] } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });
});

test.describe("PUT /api/2.0/settings/webhook/{id}/retry - Retry one delivery", () => {
  test("PUT /api/2.0/settings/webhook/{id}/retry - Queues a new record carrying the event of the retried one", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const dto = webhookDto(apiSdk);
    const { status: created } = await ownerApi.webhooks.createWebhook({
      createWebhooksConfigRequestDto: {
        ...dto,
        enabled: true,
        triggers: WebhookTrigger.All,
      },
    });
    expect(created).toBe(200);

    // An event the subscription listens to, so the portal records a delivery:
    // the retry is addressed to that record, not to the subscription.
    const { status: roomCreated } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: `Autotest hook ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.CustomRoom,
      },
    });
    expect(roomCreated).toBe(200);

    let record: { id: number; eventId?: number } | undefined;
    await expect(async () => {
      const { data } = await ownerApi.webhooks.getWebhooksLogs({ count: 10 });
      record = (data.response ?? []).find((r) => r.configName === dto.name);
      expect(
        record,
        "no delivery of the new subscription was recorded",
      ).toBeDefined();
    }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

    // 409 means that record is being delivered right now, so ask again.
    let retried: { id?: number; eventId?: number; retriedBy?: { id?: string } };
    await expect(async () => {
      const { data, status } = await ownerApi.webhooks.retryWebhook({
        id: record!.id,
      });
      expect(status).toBe(200);
      retried = data.response!;
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 30_000 });

    const { data: self } = await ownerApi.profiles.getSelfProfile();

    expect(retried!.id).not.toBe(record!.id);
    expect(retried!.eventId).toBe(record!.eventId);
    expect(retried!.retriedBy?.id).toBe(self.response!.id);
  });

  test("PUT /api/2.0/settings/webhook/{id}/retry - An id of zero is invalid and an unknown one is missing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status: zero } = await ownerApi.webhooks.retryWebhook({ id: 0 });
    expect(zero).toBe(400);

    // A record id, not a subscription id - and this names neither.
    const { status: unknown } = await ownerApi.webhooks.retryWebhook({
      id: 999999999,
    });
    expect(unknown).toBe(404);
  });
});
