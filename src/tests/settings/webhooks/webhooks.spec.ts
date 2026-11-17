import { createHmac } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import type { ApiSDK } from "@/src/services/api-sdk";
import {
  EmployeeStatus,
  EmployeeType,
  FileShare,
  RoomType,
  WebhookTrigger,
} from "@onlyoffice/docspace-api-sdk";

// The portal under test is its own receiver: it answers HEAD with 200, which
// the backend demands before storing a subscription, and POST with 405, so no
// delivery succeeds. Anywhere else would post portal data, names and addresses
// among it, outside the test. The query string keeps each subscription apart.
const webhookUri = (apiSdk: ApiSDK) =>
  `${apiSdk.tokenStore.portalBaseUrl}/?id=${apiSdk.faker.generateString(10)}`;

// NOTE: secretKey is required by the backend on create/update even though the
// SDK type marks it optional; omitting it returns 400.
const webhookDto = (apiSdk: ApiSDK) => ({
  name: apiSdk.faker.generateString(10),
  uri: webhookUri(apiSdk),
  secretKey: apiSdk.faker.generateString(20),
});

type DeliveryRecord = {
  id: number;
  eventId?: number;
  configName?: string;
  trigger?: number;
  delivery?: string | null;
  retriedBy?: { id?: string };
  creationTime?: string;
  method?: string;
  route?: string;
  requestHeaders?: string | null;
  requestPayload?: string | null;
  responseHeaders?: string | null;
  responsePayload?: string | null;
  status?: number;
  attempts?: number;
  nextAttemptOn?: string | null;
};

type SentHook = {
  event: { id: number; createOn: string; trigger: string };
  payload: { id: number; createdBy?: { id?: string } };
  webhook: {
    retryCount?: number;
    lastFailureOn?: string;
    lastFailureContent?: string;
  };
};

const sentHeaders = (record: DeliveryRecord): Record<string, string[]> =>
  JSON.parse(record.requestHeaders ?? "{}");

const sentHook = (record: DeliveryRecord): SentHook =>
  JSON.parse(record.requestPayload ?? "{}");

const secondsBetween = (from: string, to: string) =>
  (new Date(to).getTime() - new Date(from).getTime()) / 1000;

type RoleApi = ReturnType<ApiSDK["forRole"]>;

// Every delivery test starts the same way: a subscription, an event to fill
// its log, the log. Only the owning role and the triggers differ, so only
// those stay at the call site.
const subscribe = async (
  api: RoleApi,
  apiSdk: ApiSDK,
  triggers: WebhookTrigger,
): Promise<{ configId: number; dto: ReturnType<typeof webhookDto> }> => {
  const dto = webhookDto(apiSdk);
  const { data, status } = await api.webhooks.createWebhook({
    createWebhooksConfigRequestDto: { ...dto, enabled: true, triggers },
  });
  expect(status).toBe(200);
  return { configId: data.response!.id!, dto };
};

const createRoom = async (api: RoleApi, apiSdk: ApiSDK) => {
  const title = `Autotest hook ${apiSdk.faker.generateString(8)}`;
  const { data, status } = await api.rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  expect(status).toBe(200);
  return { roomId: data.response!.id!, title };
};

const deliveryLog = async (api: RoleApi, configId: number) => {
  const { data } = await api.webhooks.getWebhooksLogs({ configId, count: 50 });
  return (data.response ?? []) as DeliveryRecord[];
};

// What a REST answer adds for the one who asked: their rights, badges and
// share links. A delivery has no such reader - every subscriber gets the same
// body - so the payload carries none of it.
const VIEWER_FIELDS = [
  "security",
  "access",
  "canShare",
  "shared",
  "mute",
  "pinned",
  "new",
  "tags",
  "logo",
  "inRoom",
  "requestToken",
  "passwordProtected",
  "external",
  "isArchive",
  "lifetime",
  "watermark",
];

test.describe("POST /api/2.0/settings/webhook - Create a webhook", () => {
  test("POST /api/2.0/settings/webhook - Owner creates a webhook and gets it back without the secret", async ({
    apiSdk,
  }) => {
    const dto = webhookDto(apiSdk);

    const { data, status } = await apiSdk
      .forRole("owner")
      .webhooks.createWebhook({
        createWebhooksConfigRequestDto: {
          ...dto,
          enabled: true,
          // Sent against their defaults - a subscription left alone comes back
          // with ssl on and triggers 0 - so the answer proves they were taken.
          ssl: false,
          triggers: WebhookTrigger.FileCreated,
        },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.id).toBe("number");
    expect(data.response?.name).toBe(dto.name);
    expect(data.response?.uri).toBe(dto.uri);
    expect(data.response?.enabled).toBe(true);
    expect(data.response?.ssl).toBe(false);
    expect(data.response?.triggers).toBe(WebhookTrigger.FileCreated);
    expect(data.response?.createdBy?.id).toBeDefined();
    expect(data.response?.createdOn).toBeDefined();

    // The secret signs the deliveries and is never handed back.
    expect(
      (data.response as unknown as { secretKey?: string }).secretKey,
    ).toBeUndefined();
  });
});

test.describe("GET /api/2.0/settings/webhook - Get tenant webhooks", () => {
  test("GET /api/2.0/settings/webhook - Owner gets the created webhook in the list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    // Subscribed to an event this test never causes, so the status below stays
    // put.
    const { configId, dto } = await subscribe(
      ownerApi,
      apiSdk,
      WebhookTrigger.RoomCreated,
    );

    const { data, status } = await ownerApi.webhooks.getTenantWebhooks();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    // The stored fields are read back by the update and enable tests. What is
    // left to this one is what only the listing carries: the code each
    // subscription's last delivery came back with, absent here as none was.
    const found = data.response?.find((w) => w.configs?.id === configId);
    expect(found).toBeDefined();
    expect(found?.configs?.name).toBe(dto.name);
    expect(found?.status).toBe(0);
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

    // Read back: the answer only repeats the request, so on its own it cannot
    // tell a stored change from an ignored one.
    const { data: list } = await ownerApi.webhooks.getTenantWebhooks();
    const stored = list.response?.find((w) => w.configs?.id === id)?.configs;
    expect(stored?.name).toBe(updated.name);
    expect(stored?.uri).toBe(updated.uri);
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

    // Read back, for the same reason - and the rest of the record has to have
    // survived the toggle.
    const { data: list } = await ownerApi.webhooks.getTenantWebhooks();
    const stored = list.response?.find((w) => w.configs?.id === id)?.configs;
    expect(stored?.enabled).toBe(false);
    expect(stored?.name).toBe(dto.name);
    expect(stored?.uri).toBe(dto.uri);
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

    // A name has to carry the bit the API wants back in `triggers`, and has to
    // be the one a delivery is labelled with.
    const triggers = data.response!;
    const bitOf = (name: string) => triggers.find((t) => t.name === name)?.id;
    expect(bitOf("room.created")).toBe(WebhookTrigger.RoomCreated);
    expect(bitOf("file.created")).toBe(WebhookTrigger.FileCreated);

    // The catch-all is listed like any other event, with the bit for them all.
    expect(bitOf("*")).toBe(WebhookTrigger.All);

    // Every entry says whether this caller may subscribe; the owner may to all.
    expect(triggers.filter((t) => t.available !== true)).toEqual([]);
  });
});

test.describe("GET /api/2.0/settings/webhooks/log - Get webhook logs", () => {
  test("GET /api/2.0/settings/webhooks/log - The record of an event carries what was sent and the answer that came back", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { configId, dto } = await subscribe(
      ownerApi,
      apiSdk,
      WebhookTrigger.RoomCreated,
    );
    const { roomId, title } = await createRoom(ownerApi, apiSdk);

    let records: DeliveryRecord[] = [];
    await expect(async () => {
      records = await deliveryLog(ownerApi, configId);
      expect(records[0], "the room creation reached no delivery").toBeDefined();
      // The attempt runs behind the request: the status is 0 until an answer
      // has come back.
      expect(records[0].status).toBeGreaterThan(0);
    }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

    // Only the event the subscription asked for was recorded, and the record
    // says where it went: the subscription's own address, by POST.
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.trigger).toBe(WebhookTrigger.RoomCreated);
    expect(record.configName).toBe(dto.name);
    expect(record.method).toBe("POST");
    expect(record.route).toBe(dto.uri);

    // What left the portal: the room as itself, its author as a summary.
    const payload = sentHook(record).payload as unknown as Record<
      string,
      unknown
    >;
    expect(payload.id).toBe(roomId);
    expect(payload.title).toBe(title);
    expect(payload.roomType).toBe(RoomType.CustomRoom);
    const createdBy = payload.createdBy as Record<string, unknown>;
    expect(createdBy.id).toBeTruthy();
    expect(createdBy.displayName).toBeTruthy();
    // The one thing every receiver must check, and the one whose breakage is
    // silent. Checkable here because the log keeps the body exactly as it was
    // signed and this test set the secret.
    const headers = sentHeaders(record);
    const signed = createHmac("sha256", dto.secretKey)
      .update(record.requestPayload ?? "", "utf8")
      .digest("hex")
      .toUpperCase();
    expect(headers["x-docspace-signature-256"]).toEqual([`sha256=${signed}`]);

    // A receiver can route the event without parsing the body.
    const { event } = sentHook(record);
    expect(headers["x-docspace-event-id"]).toEqual([String(event.id)]);
    expect(headers["x-docspace-event-timestamp"]).toEqual([event.createOn]);
    expect(event.id).toBe(record.eventId);

    await test.step("None of the reader-dependent fields left the portal", async () => {
      const { data: rest, status: restStatus } =
        await ownerApi.rooms.getRoomInfo({ id: roomId });
      expect(restStatus).toBe(200);

      // Taken from the REST answer for this very room, not a list written
      // here, so a field the API drops later stops being claimed as hidden.
      const readerFields = Object.keys(rest.response!).filter((field) =>
        VIEWER_FIELDS.includes(field),
      );
      expect(readerFields.length).toBeGreaterThan(0);
      expect(readerFields.filter((field) => field in payload)).toEqual([]);
    });

    // The receiver refused the body, and the delivery moment is set only on a
    // success, so a refused delivery is never recorded as a delivered one.
    expect(record.status).toBe(405);
    expect(record.delivery).toBeFalsy();

    // Why it was refused is kept, so a failure can be read back. On a refusal
    // that is the sender's own message, not the receiver's body: the real
    // answer reaches `responseHeaders`/`responsePayload` only on a success.
    expect(record.responsePayload).toContain("405");
  });

  test("GET /api/2.0/settings/webhooks/log - A member filtering by another member's id is given their own deliveries", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: memberApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;
    const { data: self } = await ownerApi.profiles.getSelfProfile();
    const ownerId = self.response!.id!;

    // One subscription each, and an event only its own author can see: the
    // member is not shown the owner's room, so each log holds one side.
    const { configId: ownerConfigId, dto: ownerDto } = await subscribe(
      ownerApi,
      apiSdk,
      WebhookTrigger.RoomCreated,
    );
    const { configId: memberConfigId, dto: memberDto } = await subscribe(
      memberApi,
      apiSdk,
      WebhookTrigger.RoomCreated,
    );
    await createRoom(ownerApi, apiSdk);
    await createRoom(memberApi, apiSdk);

    await expect(async () => {
      expect(await deliveryLog(ownerApi, ownerConfigId)).not.toHaveLength(0);
      expect(await deliveryLog(ownerApi, memberConfigId)).not.toHaveLength(0);
    }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

    // Whose subscriptions the records came from, by the name each carries.
    const authorsSeenBy = async (api: RoleApi, userId: string) => {
      const { data, status } = await api.webhooks.getWebhooksLogs({
        userId,
        count: 50,
      });
      expect(status).toBe(200);
      const records = (data.response ?? []) as DeliveryRecord[];
      return [...new Set(records.map((record) => record.configName))];
    };

    // Named the owner and got themselves: for a caller who is not a DocSpace
    // administrator the parameter is replaced with their own id, so the filter
    // cannot be turned into a way of reading someone else's deliveries.
    expect(await authorsSeenBy(memberApi, ownerId)).toEqual([memberDto.name]);

    // An administrator really is filtering by the id they send - which is what
    // makes the line above a restriction and not a parameter that does nothing.
    expect(await authorsSeenBy(ownerApi, memberId)).toEqual([memberDto.name]);
    expect(await authorsSeenBy(ownerApi, ownerId)).toEqual([ownerDto.name]);
  });
});

test.describe("Webhook automatic retries", () => {
  test("A failed delivery is retried in a minute and the retry carries the attempt number and the last failure", async ({
    apiSdk,
  }) => {
    test.setTimeout(4 * 60_000);
    const ownerApi = apiSdk.forRole("owner");
    // The target answers POST with 405, so the first delivery fails and the
    // retry schedule starts on its own.
    const { configId } = await subscribe(
      ownerApi,
      apiSdk,
      WebhookTrigger.RoomCreated,
    );
    await createRoom(ownerApi, apiSdk);

    const waitForAttempt = async (attempts: number, timeout: number) => {
      let record: DeliveryRecord | undefined;
      await expect(async () => {
        record = (await deliveryLog(ownerApi, configId))[0];
        expect(record?.attempts).toBe(attempts);
        expect(record?.status).toBeGreaterThan(0);
      }).toPass({ intervals: [3000], timeout });
      return record!;
    };

    const first =
      await test.step("First attempt fails, the next one is in a minute", async () => {
        const record = await waitForAttempt(1, 60_000);
        expect(record.status).toBe(405);
        expect(sentHook(record).webhook.retryCount).toBeUndefined();

        const delay = secondsBetween(
          record.creationTime!,
          record.nextAttemptOn!,
        );
        expect(delay).toBeGreaterThanOrEqual(50);
        expect(delay).toBeLessThanOrEqual(90);
        return record;
      });

    await test.step("Second attempt carries the retry count and the last failure, and the next one is five minutes further on", async () => {
      const record = await waitForAttempt(2, 150_000);
      // Retries update the record in place.
      expect(record.id).toBe(first.id);

      const { webhook } = sentHook(record);
      expect(webhook.retryCount).toBe(1);
      expect(webhook.lastFailureOn).toBeTruthy();
      expect(webhook.lastFailureContent).toContain("405");

      // `lastFailureOn` is the PREVIOUS attempt's failure, so this span covers
      // both waits - the minute before this attempt and the five before the
      // next - and each leg carries its own +/-10% jitter.
      const delay = secondsBetween(
        webhook.lastFailureOn!,
        record.nextAttemptOn!,
      );
      expect(delay).toBeGreaterThanOrEqual(0.9 * (60 + 300));
      expect(delay).toBeLessThanOrEqual(1.1 * (60 + 300) + 30);
    });
  });
});

test.describe("Webhook on a room owner change", () => {
  test("POST /api/2.0/files/owner - Changing the room owner sends room.updated, not folder.updated", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { configId } = await subscribe(ownerApi, apiSdk, WebhookTrigger.All);
    const { roomId } = await createRoom(ownerApi, apiSdk);

    const { data: member } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const newOwnerId = member.response!.id!;

    const { status: ownerStatus } = await ownerApi.sharing.changeFileOwner({
      changeOwnerRequestDto: { folderIds: [roomId], userId: newOwnerId },
    });
    expect(ownerStatus).toBe(200);

    let hooks: SentHook[] = [];
    await expect(async () => {
      hooks = (await deliveryLog(ownerApi, configId))
        .map(sentHook)
        .filter((hook) => hook.payload?.id === roomId);
      expect(hooks.map((hook) => hook.event.trigger)).toContain("room.updated");
    }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

    const updated = hooks.find((hook) => hook.event.trigger === "room.updated");
    expect(updated!.payload.createdBy?.id).toBe(newOwnerId);
    expect(hooks.map((hook) => hook.event.trigger)).not.toContain(
      "folder.updated",
    );
  });
});

test.describe("PUT /api/2.0/settings/webhook/retry - Retry webhooks", () => {
  test("PUT /api/2.0/settings/webhook/retry - Only the named records are retried, and an unknown id is skipped", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { configId } = await subscribe(
      ownerApi,
      apiSdk,
      WebhookTrigger.RoomCreated,
    );
    // Two events, so that retrying one says something about the other.
    await createRoom(ownerApi, apiSdk);
    await createRoom(ownerApi, apiSdk);

    let records: DeliveryRecord[] = [];
    await expect(async () => {
      records = await deliveryLog(ownerApi, configId);
      expect(records).toHaveLength(2);
      expect(records.filter((r) => r.requestHeaders)).toHaveLength(2);
    }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

    const [retried, untouched] = records;

    // A record being delivered right now is skipped silently rather than
    // refused, so the call is repeated until it takes.
    let queued: DeliveryRecord[] = [];
    await expect(async () => {
      const { data, status } = await ownerApi.webhooks.retryWebhooks({
        webhookRetryRequestDto: { ids: [retried.id, 999999999] },
      });
      expect(status).toBe(200);
      queued = (data.response ?? []) as DeliveryRecord[];
      expect(queued).toHaveLength(1);
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 30_000 });

    // The unknown id was dropped without failing the call, and the record that
    // came back is a new one for the event that was asked for.
    expect(queued[0].eventId).toBe(retried.eventId);
    expect(queued[0].id).not.toBe(retried.id);

    // Nothing else was retried, and the record that was not named is still
    // there, as it was.
    const after = await deliveryLog(ownerApi, configId);
    expect(after.filter((r) => r.retriedBy).map((r) => r.eventId)).toEqual([
      retried.eventId,
    ]);
    const stillThere = after.find((r) => r.id === untouched.id);
    expect(stillThere).toBeDefined();
    expect(stillThere!.retriedBy).toBeUndefined();
  });
});

test.describe("PUT /api/2.0/settings/webhook/{id}/retry - Retry one delivery", () => {
  test("PUT /api/2.0/settings/webhook/{id}/retry - The retry sends the original event id and is written to the audit", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { configId, dto } = await subscribe(
      ownerApi,
      apiSdk,
      WebhookTrigger.RoomCreated,
    );
    await createRoom(ownerApi, apiSdk);

    let original: DeliveryRecord | undefined;
    await expect(async () => {
      original = (await deliveryLog(ownerApi, configId)).find(
        (r) => !r.retriedBy,
      );
      expect(original?.requestHeaders, "no delivery was sent").toBeTruthy();
    }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

    // 409 means that record is being delivered right now, so ask again.
    let queued: DeliveryRecord | undefined;
    await expect(async () => {
      const { data, status } = await ownerApi.webhooks.retryWebhook({
        id: original!.id,
      });
      expect(status).toBe(200);
      queued = data.response as DeliveryRecord;
    }).toPass({ intervals: [1000, 2000, 3000], timeout: 30_000 });

    // A manual retry is a record of its own - unlike an automatic one, which
    // updates the record in place - and it is stamped with who asked.
    const { data: self } = await ownerApi.profiles.getSelfProfile();
    expect(queued!.id).not.toBe(original!.id);
    expect(queued!.eventId).toBe(original!.eventId);
    expect(queued!.retriedBy?.id).toBe(self.response!.id);

    await test.step("The retry sends the same event id in the body and the headers", async () => {
      let retried: DeliveryRecord | undefined;
      await expect(async () => {
        retried = (await deliveryLog(ownerApi, configId)).find(
          (r) => r.retriedBy,
        );
        expect(retried?.requestHeaders, "the retry was not sent").toBeTruthy();
      }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

      const originalHeaders = sentHeaders(original!);
      const retriedHeaders = sentHeaders(retried!);
      expect(sentHook(retried!).event.id).toBe(sentHook(original!).event.id);
      expect(retriedHeaders["x-docspace-event-id"]).toEqual(
        originalHeaders["x-docspace-event-id"],
      );
      expect(retriedHeaders["x-docspace-event-timestamp"]).toEqual(
        originalHeaders["x-docspace-event-timestamp"],
      );
    });

    await test.step("The audit trail has the retry", async () => {
      await expect(async () => {
        const { data } = await ownerApi.auditTrail.getLastAuditEvents();
        expect((data.response ?? []).map((e) => e.action)).toContain(
          `Webhook delivery retried: ${dto.name}`,
        );
      }).toPass({ intervals: [1000, 2000, 3000], timeout: 30_000 });
    });
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

/**
 * A delivery is not decided once, when the subscription is saved: before every
 * attempt the portal asks again whether its author may still receive the event.
 * A deactivated or demoted author stops being delivered to, and nothing about
 * the subscription changes to say so - which is what makes this worth a test.
 *
 * Each test pins the outcome, not the clause behind it: every event a role
 * loses is also one it can no longer see, so both checks fall together.
 */
test.describe("Webhook delivery follows the state of the subscription's author", () => {
  type SentUserHook = {
    event?: { trigger?: string };
    payload?: { id?: string | number; firstName?: string | null };
  };

  const sentHooks = (records: DeliveryRecord[]): SentUserHook[] =>
    records.map((record) => JSON.parse(record.requestPayload ?? "{}"));

  test("PUT /api/2.0/people/status/{status} - A deactivated author stops being delivered to, and the subscription says nothing about it", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: memberApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;

    // Two subscriptions to the same event. The owner's is the control: without
    // it, silence could just as well mean nothing was published.
    const { configId: authorConfigId } = await subscribe(
      memberApi,
      apiSdk,
      WebhookTrigger.UserUpdated,
    );
    const { configId: controlConfigId } = await subscribe(
      ownerApi,
      apiSdk,
      WebhookTrigger.UserUpdated,
    );

    const { data: self } = await ownerApi.profiles.getSelfProfile();
    const owner = self.response!;

    // Renaming the owner is the event, and the new name tells one delivery from
    // the next. It has to be a real change: a no-op update publishes nothing.
    const renameOwner = async (firstName: string) => {
      const { data, status } = await ownerApi.profiles.updateMember({
        userId: owner.id!,
        updateMemberRequestDto: { firstName, lastName: owner.lastName },
      });
      expect(status).toBe(200);
      expect(data.response!.firstName).toBe(firstName);
    };

    const delivered = async (configId: number, firstName: string) =>
      sentHooks(await deliveryLog(ownerApi, configId)).some(
        (hook) => hook.payload?.firstName === firstName,
      );

    const before = `Before${apiSdk.faker.generateString(6)}`;
    const after = `After${apiSdk.faker.generateString(6)}`;

    await test.step("While the author is active the delivery reaches them", async () => {
      await renameOwner(before);
      await expect(async () => {
        expect(await delivered(authorConfigId, before)).toBe(true);
      }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });
    });

    const { status: terminated } = await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [memberId] },
    });
    expect(terminated).toBe(200);

    await renameOwner(after);

    // The control saw the event, so it was published.
    await expect(async () => {
      expect(await delivered(controlConfigId, after)).toBe(true);
    }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

    // The author's did not, while the delivery from before the deactivation is
    // still in its log: it was not removed, it is no longer written to.
    expect(await delivered(authorConfigId, after)).toBe(false);
    expect(await delivered(authorConfigId, before)).toBe(true);

    await test.step("The subscription itself does not report that it is dead", async () => {
      const { data: list, status } =
        await ownerApi.webhooks.getTenantWebhooks();
      expect(status).toBe(200);
      const entry = list.response!.find(
        (webhook) => webhook.configs?.id === authorConfigId,
      );
      // Still listed and still enabled - a reader of the API has nothing to
      // tell it apart from the control, which is being delivered to.
      expect(entry).toBeDefined();
      expect(entry!.configs?.enabled).toBe(true);
    });
  });

  /**
   * The other direction - lowering a role until it loses a trigger - cannot be
   * produced through the API: `UserManagerWrapper.UpdateUserTypeAsync` has no
   * path from RoomAdmin to User (the only way into `User` is from `Guest`), so
   * the call answers 403. The mechanism under test is the same either way.
   */
  test("PUT /api/2.0/people/type/{type} - Raising the author's role widens their catch-all subscription", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: memberData, api: memberApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = memberData.response!.id!;

    // A room the author works in. Its file events are the part of the stream a
    // plain member is entitled to, and so the control for the missing one.
    const { roomId } = await createRoom(ownerApi, apiSdk);

    const { status: invited } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Editing }],
        notify: false,
      },
    });
    expect(invited).toBe(200);

    // The catch-all stands for every event the author's role may receive, not
    // for every event of the portal.
    const { configId } = await subscribe(memberApi, apiSdk, WebhookTrigger.All);

    const sawEvent = async (trigger: string, id: string | number) =>
      sentHooks(await deliveryLog(ownerApi, configId)).some(
        (hook) => hook.event?.trigger === trigger && hook.payload?.id === id,
      );

    const addFile = async () => {
      const { data, status } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileRequest: { title: `Hook ${apiSdk.faker.generateString(6)}` },
      });
      expect(status).toBe(200);
      return data.response!.id!;
    };

    // Through the SDK client, not apiSdk.addMember: that helper posts on the
    // raw context, which carries the cookie jar, so the portal would run it as
    // the member authenticated last - who may not add anyone.
    const addUser = async () => {
      const user = apiSdk.faker.generateUser();
      const { data, status } = await ownerApi.profiles.addMember({
        memberRequestDto: {
          email: user.email,
          password: user.password,
          firstName: user.firstName,
          lastName: user.lastName,
          type: EmployeeType.User,
        },
      });
      expect(status).toBe(200);
      return data.response!.id!;
    };

    await test.step("A plain member receives the file event and not the member event", async () => {
      const addedId = await addUser();
      // Raised first, so that the file event arriving proves the member event
      // had its chance and was left out rather than being merely slower.
      const fileId = await addFile();

      await expect(async () => {
        expect(await sawEvent("file.created", fileId)).toBe(true);
      }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });

      expect(await sawEvent("user.created", addedId)).toBe(false);
    });

    const { status: promoted } = await ownerApi.userType.updateUserType({
      type: EmployeeType.RoomAdmin,
      updateMembersRequestDto: { userIds: [memberId] },
    });
    expect(promoted).toBe(200);

    await test.step("The same subscription receives the member event once the role may have it", async () => {
      const addedId = await addUser();

      await expect(async () => {
        expect(await sawEvent("user.created", addedId)).toBe(true);
      }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });
    });
  });
});

/**
 * A user payload is cut per subscriber: `UserWebhookDtoHelper` hands a DocSpace
 * admin the whole profile and takes the account's author, the quota and - for a
 * subscriber without contacts access - the contact block away from everyone
 * else, unless the profile is their own.
 *
 * Only the author is observable from here. The quota fields are filled for
 * nobody on a portal in this state, so their absence would prove nothing, and
 * the contacts branch is out of reach: only a `User` or a `Guest` lacks
 * contacts access, and `WebhookUserAccessChecker` already withholds the whole
 * event from those two about anyone but themselves.
 */
test.describe("Webhook payloads are cut to what the subscription's author may see", () => {
  test("PUT /api/2.0/people/status/{status} - A non-admin subscriber is not told who opened the account", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    // The subscriber is added first: these helpers post on the raw context, so
    // each runs as whoever signed in last, and a room administrator may still
    // add members while a plain user may not.
    const { api: memberApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data: targetData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const target = targetData.response!;

    const { configId: adminConfigId } = await subscribe(
      ownerApi,
      apiSdk,
      WebhookTrigger.UserUpdated,
    );
    const { configId: memberConfigId } = await subscribe(
      memberApi,
      apiSdk,
      WebhookTrigger.UserUpdated,
    );

    // Disabling them is the event. A rename would not do: `PUT /people/{id}`
    // answers 200 for a member added through the API and applies nothing, so
    // nothing is published either.
    const { status: disabled } = await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [target.id!] },
    });
    expect(disabled).toBe(200);

    const deliveredTo = async (configId: number) => {
      let payload: Record<string, unknown> | undefined;
      await expect(async () => {
        payload = (await deliveryLog(ownerApi, configId))
          .map(
            (record) =>
              (
                JSON.parse(record.requestPayload ?? "{}") as {
                  payload?: Record<string, unknown>;
                }
              ).payload,
          )
          .find(
            (sent) =>
              sent?.id === target.id &&
              sent?.status === EmployeeStatus.Terminated,
          );
        expect(payload, "the change reached no delivery").toBeDefined();
      }).toPass({ intervals: [500, 1000, 2000], timeout: 60_000 });
      return payload!;
    };

    const forAdmin = await deliveredTo(adminConfigId);
    const forMember = await deliveredTo(memberConfigId);

    // The same event about the same person; only the listener differs.
    expect(forMember.id).toBe(forAdmin.id);

    // Who opened the account is the administrator's business, and the absence
    // is a cut rather than an empty value: the administrator was sent one.
    expect(forAdmin.createdBy).toBeDefined();
    expect(forMember.createdBy).toBeUndefined();

    // Cut, not emptied: a room administrator may see contacts, so the rest of
    // the profile still arrives, contacts included.
    expect(forMember.email).toBe(forAdmin.email);
    expect(forMember.displayName).toBe(forAdmin.displayName);
    expect(forMember.status).toBe(forAdmin.status);
  });
});
