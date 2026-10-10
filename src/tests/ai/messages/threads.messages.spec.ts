import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  MALFORMED_ID,
  UNKNOWN_ID,
  appendText,
  appendedMessage,
  createThread,
  expectUuid,
  getThread,
  listThreadIds,
  readAll,
  readTexts,
  textOf,
  threadsSetup,
  waitUntil,
} from "@/src/helpers/ai-threads";

// ThreadsApi, message-level methods: read-messages, append-user-message,
// get-message-by-id, update-message, delete-message (SDK 4.0.0).
//
// Existing coverage that is not repeated: markdown/LaTeX survive the write path
// (messages.spec.ts "markdown on the write path"), cross-user 403 on the
// per-message routes, AI-off 403, the 40-message replay (chat.spec.ts), export
// to docx, "an edited question stays where it was".
//
// Contract notes measured on the live portal (2026-10-09):
//   * `read-messages` takes `count`, `cursor`, `direction`. `count` <= 0 is 400.
//     `direction=desc` with `count` pages back from the newest message; the
//     cursor is the JSON of the last received item, {"createdAt","id"}.
//   * `append-user-message` answers `{messageId: <the whole stored message>}`
//     although SDK 4.0.0 types `messageId` as a string; both shapes are
//     accepted by `appendedMessage`.
//   * `delete-message` is idempotent: unknown and repeated ids answer 200.

function updateRequest(messageId: string, text: string) {
  return {
    aiThreadsUpdateMessageRequest: {
      messageId,
      message: { role: "user" as const, content: [{ type: "text", text }] },
    },
  };
}

const AWKWARD_TEXTS: string[] = [
  "Привет, как дела? №1 — «ёлка»",
  "emoji 😀🚀 and a zero-width​joiner",
  "line one\nline two\n\nline four with trailing spaces   ",
  `quotes "double" 'single' \`tick\` <b>markup</b> & &amp; % _ \\ /`,
  "x".repeat(20000),
];

// ---------------------------------------------------------------------------
// aiThreadsReadMessages

test.describe("GET /api/2.0/ai/threads/read-messages - ThreadsApi.aiThreadsReadMessages", () => {
  test("GET /api/2.0/ai/threads/read-messages - stored messages come back whole, in order, with unique ids", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Reading");

    expect(await readAll(ctx, threadId), "an empty history").toEqual([]);

    const ids: string[] = [];
    for (const text of AWKWARD_TEXTS)
      ids.push(await appendText(ctx, threadId, text));

    const messages = await readAll(ctx, threadId);

    expect(messages.map((message) => message.id)).toEqual(ids);
    expect(messages.map((message) => textOf(message))).toEqual(AWKWARD_TEXTS);
    expect(new Set(messages.map((message) => message.id)).size).toBe(
      ids.length,
    );
    for (const message of messages) {
      expectUuid(message.id, "message id");
      expect(message.role).toBe("user");
      expect(Number.isNaN(Date.parse(message.createdAt!))).toBe(false);
    }
    const stamps = messages.map((message) => Date.parse(message.createdAt!));
    expect(stamps, "createdAt never goes backwards").toEqual(
      [...stamps].sort((a, b) => a - b),
    );
    for (const message of messages) {
      const single = await ctx.api.aiThreadsGetMessageById({
        messageId: message.id!,
      });
      expect(single.data, "get-message-by-id agrees with the history").toEqual(
        message,
      );
    }
  });

  test("GET /api/2.0/ai/threads/read-messages - the history follows update, delete and clear", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Following");
    const [first, second, third] = [
      await appendText(ctx, threadId, "first"),
      await appendText(ctx, threadId, "second"),
      await appendText(ctx, threadId, "third"),
    ];

    await ctx.api.aiThreadsUpdateMessage(
      updateRequest(second, "second, edited"),
    );
    expect(await readTexts(ctx, threadId), "after an update").toEqual([
      "first",
      "second, edited",
      "third",
    ]);

    await ctx.api.aiThreadsDeleteMessage({ body: first });
    expect(await readTexts(ctx, threadId), "after a delete").toEqual([
      "second, edited",
      "third",
    ]);

    await ctx.api.aiThreadsClearMessages({ body: threadId });
    expect(await readAll(ctx, threadId), "after a clear").toEqual([]);
    void third;
  });

  test("GET /api/2.0/ai/threads/read-messages - count caps the page and 0 or below is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Paged");
    const texts = ["m0", "m1", "m2", "m3", "m4"];
    for (const text of texts) await appendText(ctx, threadId, text);
    const texts_of = (data: Array<Parameters<typeof textOf>[0]>) =>
      data.map((message) => textOf(message));

    const one = await ctx.api.aiThreadsReadMessages({ threadId, count: 1 });
    const three = await ctx.api.aiThreadsReadMessages({ threadId, count: 3 });
    const exact = await ctx.api.aiThreadsReadMessages({ threadId, count: 5 });
    const over = await ctx.api.aiThreadsReadMessages({ threadId, count: 100 });
    const zero = await ctx.api.aiThreadsReadMessages({ threadId, count: 0 });
    const negative = await ctx.api.aiThreadsReadMessages({
      threadId,
      count: -1,
    });

    expect(texts_of(one.data), "count=1 is the oldest").toEqual(["m0"]);
    expect(texts_of(three.data)).toEqual(["m0", "m1", "m2"]);
    expect(texts_of(exact.data)).toEqual(texts);
    expect(texts_of(over.data), "count above the total").toEqual(texts);
    expect(zero.status, "count=0").toBe(400);
    expect(negative.status, "count=-1").toBe(400);
  });

  test("GET /api/2.0/ai/threads/read-messages - direction=desc pages back from the newest, every message once", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Backwards");
    const texts = ["m0", "m1", "m2", "m3", "m4", "m5", "m6"];
    for (const text of texts) await appendText(ctx, threadId, text);

    const newestTwo = await ctx.api.aiThreadsReadMessages({
      threadId,
      count: 2,
      direction: "desc",
    });
    expect(newestTwo.data.map((message) => textOf(message))).toEqual([
      "m6",
      "m5",
    ]);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 6; page++) {
      const { status, data } = await ctx.api.aiThreadsReadMessages({
        threadId,
        count: 3,
        direction: "desc",
        cursor,
      });
      expect(status, `page ${page}`).toBe(200);
      if (data.length === 0) break;
      seen.push(...data.map((message) => textOf(message)));
      const last = data[data.length - 1];
      cursor = JSON.stringify({ createdAt: last.createdAt, id: last.id });
    }

    expect(seen, "newest first, nothing repeated, nothing skipped").toEqual(
      [...texts].reverse(),
    );
  });

  test("BUG 84407: GET /api/2.0/ai/threads/read-messages - walking forward by cursor repeats the last message of every page and never ends", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The documented cursor is "the sort key of the last item already received", so
    // the next page has to start AFTER it. Forward, it starts AT it: with count=3
    // over m0..m6 the pages are [m0 m1 m2] [m2 m3 m4] [m4 m5 m6] [m6] [m6] ... and
    // the last message is returned forever. The backward (desc) walk above is
    // exact, so the defect is the forward comparison only.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Forwards");
    const texts = ["m0", "m1", "m2", "m3", "m4", "m5", "m6"];
    for (const text of texts) await appendText(ctx, threadId, text);

    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (; pages < 6; pages++) {
      const { status, data } = await ctx.api.aiThreadsReadMessages({
        threadId,
        count: 3,
        cursor,
      });
      expect(status, `page ${pages}`).toBe(200);
      if (data.length === 0) break;
      seen.push(...data.map((message) => textOf(message)));
      const last = data[data.length - 1];
      cursor = JSON.stringify({ createdAt: last.createdAt, id: last.id });
    }

    test.fail();
    expect(seen, "each message exactly once, in order").toEqual(texts);
    expect(pages, "the walk reaches an empty page").toBeLessThan(6);
  });

  test("GET /api/2.0/ai/threads/read-messages - unknown, deleted and malformed ids are refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const keeper = await createThread(ctx, "Keeper");
    await appendText(ctx, keeper, "control");
    const doomed = await createThread(ctx, "Doomed");
    expect((await ctx.api.aiThreadsDelete({ body: doomed })).status).toBe(200);

    const unknown = await ctx.api.aiThreadsReadMessages({
      threadId: UNKNOWN_ID,
    });
    const deleted = await ctx.api.aiThreadsReadMessages({ threadId: doomed });
    const malformed = await ctx.api.aiThreadsReadMessages({
      threadId: MALFORMED_ID,
    });

    expect(await readTexts(ctx, keeper), "the route still reads").toEqual([
      "control",
    ]);
    expect(unknown.status, "unknown id").toBe(404);
    expect(deleted.status, "deleted thread").toBe(404);
    expect(malformed.status, "malformed id").toBe(400);
  });

  test("BUG 84408: GET /api/2.0/ai/threads/read-messages - a request with no threadId is refused like get-by-id refuses it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `threadId` is a required parameter. get-by-id answers 400 "threadId required"
    // for the same omission; read-messages answers 200 with an empty list, which
    // a client cannot tell from a real empty thread.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Real");
    await appendText(ctx, threadId, "something");

    const missing = await ctx.raw.send(
      "owner",
      "get",
      "/api/2.0/ai/threads/read-messages",
    );
    const empty = await ctx.raw.send(
      "owner",
      "get",
      "/api/2.0/ai/threads/read-messages?threadId=",
    );
    const sibling = await ctx.raw.send(
      "owner",
      "get",
      "/api/2.0/ai/threads/get-by-id",
    );

    expect(sibling.status, "the neighbouring route refuses the omission").toBe(
      400,
    );
    test.fail();
    expect(missing.status, "no threadId").toBe(400);
    expect(empty.status, "an empty threadId").toBe(400);
  });
});

// ---------------------------------------------------------------------------
// aiThreadsAppendUserMessage

test.describe("POST /api/2.0/ai/threads/append-user-message - ThreadsApi.aiThreadsAppendUserMessage", () => {
  test("POST /api/2.0/ai/threads/append-user-message - a stored message is the same message through every read path", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Writing");
    const bystander = await createThread(ctx, "Bystander");

    const { status, data } = await ctx.api.aiThreadsAppendUserMessage({
      aiThreadsAppendUserMessageRequest: {
        threadId,
        profileId: ctx.profileId,
        message: { role: "user", content: [{ type: "text", text: "Hello" }] },
      },
    });

    expect(status).toBe(200);
    const stored = appendedMessage(data);
    expectUuid(stored.id, "message id");
    expect(stored.role).toBe("user");

    const read = await readAll(ctx, threadId);
    expect(read.map((message) => message.id)).toEqual([stored.id]);
    expect(textOf(read[0])).toBe("Hello");
    const byId = await ctx.api.aiThreadsGetMessageById({
      messageId: stored.id,
    });
    expect(byId.data).toEqual(read[0]);
    const opened = await ctx.aiChat.openOrCreateThread("owner", {
      threadId,
      profileId: ctx.profileId,
      profile: ctx.profile,
      entityId: String(ctx.agentId),
    });
    expect(
      (opened.data?.priorMessages as Array<{ id: string }>).map((m) => m.id),
    ).toEqual([stored.id]);

    expect(await readAll(ctx, bystander), "another thread got nothing").toEqual(
      [],
    );
    const listed = await listThreadIds(ctx);
    expect(listed.map((thread) => thread.threadId).sort()).toEqual(
      [threadId, bystander].sort(),
    );
  });

  for (const text of AWKWARD_TEXTS) {
    test(`POST /api/2.0/ai/threads/append-user-message - ${JSON.stringify(text.slice(0, 24))}${text.length > 24 ? ` (${text.length} chars)` : ""} is stored exactly as sent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await threadsSetup(apiSdk, paymentsApi);
      const threadId = await createThread(ctx, "Verbatim");

      const messageId = await appendText(ctx, threadId, text);

      expect(await readTexts(ctx, threadId)).toEqual([text]);
      const byId = await ctx.api.aiThreadsGetMessageById({ messageId });
      expect(textOf(byId.data)).toBe(text);
    });
  }

  test("POST /api/2.0/ai/threads/append-user-message - many appends keep their order, work after a clear, and never draw an answer from the model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Sequence");
    const texts = Array.from({ length: 12 }, (_, index) => `step ${index}`);
    for (const text of texts) await appendText(ctx, threadId, text);

    expect(await readTexts(ctx, threadId)).toEqual(texts);

    await ctx.api.aiThreadsClearMessages({ body: threadId });
    await appendText(ctx, threadId, "after the clear");
    expect(await readTexts(ctx, threadId)).toEqual(["after the clear"]);

    // "No inference" is an absence, so it gets an observation window: a reply
    // would land within a few seconds of a send. The positive control is the
    // send-with-stream suite, where the same wait does see a reply arrive.
    const stillOne = await waitUntil(
      () => readAll(ctx, threadId),
      (messages) => messages.length !== 1,
      { timeoutMs: 6000, intervalMs: 1000 },
    );
    expect(stillOne).toHaveLength(1);
    expect(stillOne.every((message) => message.role === "user")).toBe(true);
  });

  test("POST /api/2.0/ai/threads/append-user-message - parallel appends are all stored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Parallel");
    const other = await createThread(ctx, "Parallel other");
    // Ten requests in flight at once is what the route takes before the rate
    // limiter starts answering 429 (fifteen did), so the burst stays at ten.
    const texts = Array.from({ length: 6 }, (_, index) => `p${index}`);
    const otherTexts = Array.from({ length: 4 }, (_, index) => `o${index}`);

    await Promise.all([
      ...texts.map((text) => appendText(ctx, threadId, text)),
      ...otherTexts.map((text) => appendText(ctx, other, text)),
    ]);

    // The order of concurrent writes is not promised; their presence is.
    expect((await readTexts(ctx, threadId)).sort()).toEqual([...texts].sort());
    expect((await readTexts(ctx, other)).sort()).toEqual(
      [...otherTexts].sort(),
    );
  });

  test("POST /api/2.0/ai/threads/append-user-message - a refused request stores nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Strict");
    await appendText(ctx, threadId, "control");
    const doomed = await createThread(ctx, "Doomed");
    expect((await ctx.api.aiThreadsDelete({ body: doomed })).status).toBe(200);
    const message = { role: "user", content: [{ type: "text", text: "x" }] };
    const append = (body: unknown) =>
      ctx.raw.send(
        "owner",
        "post",
        "/api/2.0/ai/threads/append-user-message",
        body,
      );

    const outcomes: Array<[string, number, number]> = [
      [
        "no message",
        400,
        (await append({ threadId, profileId: ctx.profileId })).status,
      ],
      [
        "no threadId",
        400,
        (await append({ profileId: ctx.profileId, message })).status,
      ],
      [
        "a malformed threadId",
        400,
        (await append({ threadId: MALFORMED_ID, message })).status,
      ],
      [
        "an unknown threadId",
        404,
        (await append({ threadId: UNKNOWN_ID, message })).status,
      ],
      [
        "a deleted threadId",
        404,
        (await append({ threadId: doomed, message })).status,
      ],
      ["an empty body", 400, (await append({})).status],
      ["no body at all", 400, (await append(undefined)).status],
    ];

    expect(await readTexts(ctx, threadId), "nothing was stored").toEqual([
      "control",
    ]);
    for (const [label, expected, actual] of outcomes) {
      expect(actual, label).toBe(expected);
    }
  });

  test("BUG 84409: POST /api/2.0/ai/threads/append-user-message - an empty or whitespace-only message is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // send-with-stream refuses an empty message (BUG 82720, fixed); this route
    // stores it verbatim and answers 200, leaving an empty user turn in the history
    // that every later model call is built from.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "No blanks");
    await appendText(ctx, threadId, "control");
    const append = (text: string) =>
      ctx.raw.send("owner", "post", "/api/2.0/ai/threads/append-user-message", {
        threadId,
        profileId: ctx.profileId,
        message: { role: "user", content: [{ type: "text", text }] },
      });

    const empty = await append("");
    const blank = await append("   ");

    test.fail();
    expect(await readTexts(ctx, threadId), "nothing blank was stored").toEqual([
      "control",
    ]);
    expect(empty.status, "an empty text").toBe(400);
    expect(blank.status, "a whitespace text").toBe(400);
  });

  test("BUG 84410: POST /api/2.0/ai/threads/append-user-message - a message that is not a user message is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The route is named for user messages, yet it stores `assistant`, `system`,
    // an invented role and no role at all. An `assistant` turn written here is
    // replayed to the model as something it said itself.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Users only");
    await appendText(ctx, threadId, "control");
    const append = (role: string | undefined) =>
      ctx.raw.send("owner", "post", "/api/2.0/ai/threads/append-user-message", {
        threadId,
        profileId: ctx.profileId,
        message: {
          ...(role === undefined ? {} : { role }),
          content: [{ type: "text", text: "forged" }],
        },
      });

    const outcomes: Array<[string, number]> = [];
    for (const role of ["assistant", "system", "invented", undefined]) {
      outcomes.push([String(role), (await append(role)).status]);
    }

    test.fail();
    const stored = await readAll(ctx, threadId);
    expect(
      stored.map((message) => message.role),
      "only the control user message is stored",
    ).toEqual(["user"]);
    for (const [role, status] of outcomes) {
      expect(status, `role ${role}`).toBe(400);
    }
  });

  test("BUG 84409: POST /api/2.0/ai/threads/append-user-message - a message with no content, or a null message, is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `message: null` is stored as the four-character string "null"; a message with
    // no `content` is stored as a message with no content.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Real content only");
    await appendText(ctx, threadId, "control");
    const append = (message: unknown) =>
      ctx.raw.send("owner", "post", "/api/2.0/ai/threads/append-user-message", {
        threadId,
        profileId: ctx.profileId,
        message,
      });

    const nullMessage = await append(null);
    const noContent = await append({ role: "user" });

    test.fail();
    expect(await readTexts(ctx, threadId), "nothing was stored").toEqual([
      "control",
    ]);
    expect(nullMessage.status, "a null message").toBe(400);
    expect(noContent.status, "a message with no content").toBe(400);
  });
});

// ---------------------------------------------------------------------------
// aiThreadsGetMessageById

test.describe("GET /api/2.0/ai/threads/get-message-by-id - ThreadsApi.aiThreadsGetMessageById", () => {
  test("GET /api/2.0/ai/threads/get-message-by-id - serves the stored message and follows an edit, and reading changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "By id");
    const first = await appendText(ctx, threadId, "first");
    const second = await appendText(ctx, threadId, "second");

    const read = await ctx.api.aiThreadsGetMessageById({ messageId: first });
    expect(read.status).toBe(200);
    expect(read.data.id).toBe(first);
    expect(read.data.role).toBe("user");
    expect(textOf(read.data)).toBe("first");
    expect(Number.isNaN(Date.parse(read.data.createdAt!))).toBe(false);
    expect(
      (await ctx.api.aiThreadsGetMessageById({ messageId: first })).data,
      "a repeat read is identical",
    ).toEqual(read.data);

    await ctx.api.aiThreadsUpdateMessage(updateRequest(first, "first, edited"));
    expect(
      textOf(
        (await ctx.api.aiThreadsGetMessageById({ messageId: first })).data,
      ),
    ).toBe("first, edited");

    await ctx.api.aiThreadsDeleteMessage({ body: second });
    expect(
      textOf(
        (await ctx.api.aiThreadsGetMessageById({ messageId: first })).data,
      ),
      "deleting another message leaves this one alone",
    ).toBe("first, edited");
  });

  test("GET /api/2.0/ai/threads/get-message-by-id - a malformed, empty or missing id is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Control");
    const control = await appendText(ctx, threadId, "control");

    const malformed = await ctx.api.aiThreadsGetMessageById({
      messageId: MALFORMED_ID,
    });
    const empty = await ctx.raw.send(
      "owner",
      "get",
      "/api/2.0/ai/threads/get-message-by-id?messageId=",
    );
    const missing = await ctx.raw.send(
      "owner",
      "get",
      "/api/2.0/ai/threads/get-message-by-id",
    );

    expect(
      textOf(
        (await ctx.api.aiThreadsGetMessageById({ messageId: control })).data,
      ),
    ).toBe("control");
    expect(malformed.status, "malformed id").toBe(400);
    expect(empty.status, "empty id").toBe(400);
    expect(missing.status, "missing id").toBe(400);
  });

  test("BUG 84411: GET /api/2.0/ai/threads/get-message-by-id - a message that does not exist is a 404, not 200 null", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // update-message answers 404 for the same ids and get-by-id / read-messages
    // answer 404 for an unknown thread. This route answers 200 with a body of
    // `null` for a never-issued id, a deleted message, a cleared one and one whose
    // thread was deleted — a success status for "nothing here".
    //
    // messages.spec.ts "an unknown id answers 200 null" pins today's behaviour and
    // has to be turned into a 404 assertion when this is fixed.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const control = await createThread(ctx, "Control");
    const controlMessage = await appendText(ctx, control, "alive");

    const deletedMessageThread = await createThread(ctx, "Deleted message");
    const deletedMessage = await appendText(ctx, deletedMessageThread, "x");
    await ctx.api.aiThreadsDeleteMessage({ body: deletedMessage });

    const clearedThread = await createThread(ctx, "Cleared");
    const clearedMessage = await appendText(ctx, clearedThread, "x");
    await ctx.api.aiThreadsClearMessages({ body: clearedThread });

    const deletedThread = await createThread(ctx, "Deleted thread");
    const orphanMessage = await appendText(ctx, deletedThread, "x");
    await ctx.api.aiThreadsDelete({ body: deletedThread });

    const probes: Array<[string, string]> = [
      ["a never-issued id", UNKNOWN_ID],
      ["a deleted message", deletedMessage],
      ["a cleared message", clearedMessage],
      ["a message of a deleted thread", orphanMessage],
    ];
    const outcomes: Array<[string, number]> = [];
    for (const [label, messageId] of probes) {
      outcomes.push([
        label,
        (await ctx.api.aiThreadsGetMessageById({ messageId })).status,
      ]);
    }

    expect(
      textOf(
        (await ctx.api.aiThreadsGetMessageById({ messageId: controlMessage }))
          .data,
      ),
    ).toBe("alive");
    test.fail();
    for (const [label, status] of outcomes) {
      expect(status, label).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// aiThreadsUpdateMessage

test.describe("PUT /api/2.0/ai/threads/update-message - ThreadsApi.aiThreadsUpdateMessage", () => {
  test("PUT /api/2.0/ai/threads/update-message - rewrites one message in place and leaves its neighbours and the thread alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Editing");
    const bystander = await createThread(ctx, "Bystander");
    const ids = [
      await appendText(ctx, threadId, "alpha"),
      await appendText(ctx, threadId, "beta"),
      await appendText(ctx, threadId, "gamma"),
    ];
    await appendText(ctx, bystander, "other thread");
    const before = await readAll(ctx, threadId);
    const bystanderBefore = await readAll(ctx, bystander);
    const titleBefore = (await getThread(ctx, threadId)).title;

    const { status, data } = await ctx.api.aiThreadsUpdateMessage(
      updateRequest(ids[1], "beta, rewritten"),
    );

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const after = await readAll(ctx, threadId);
    expect(
      after.map((message) => message.id),
      "same ids, same positions",
    ).toEqual(ids);
    expect(after.map((message) => textOf(message))).toEqual([
      "alpha",
      "beta, rewritten",
      "gamma",
    ]);
    expect(after[0], "the message before is untouched").toEqual(before[0]);
    expect(after[2], "the message after is untouched").toEqual(before[2]);
    expect(Date.parse(after[1].createdAt!)).toBeGreaterThanOrEqual(
      Date.parse(before[1].createdAt!),
    );
    expect(
      await readAll(ctx, bystander),
      "another thread is untouched",
    ).toEqual(bystanderBefore);
    expect((await getThread(ctx, threadId)).title).toBe(titleBefore);
  });

  for (const text of AWKWARD_TEXTS) {
    test(`PUT /api/2.0/ai/threads/update-message - ${JSON.stringify(text.slice(0, 24))}${text.length > 24 ? ` (${text.length} chars)` : ""} is stored exactly as sent`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await threadsSetup(apiSdk, paymentsApi);
      const threadId = await createThread(ctx, "Verbatim edit");
      const messageId = await appendText(ctx, threadId, "plain");

      const { status } = await ctx.api.aiThreadsUpdateMessage(
        updateRequest(messageId, text),
      );

      expect(status).toBe(200);
      expect(await readTexts(ctx, threadId)).toEqual([text]);
    });
  }

  test("PUT /api/2.0/ai/threads/update-message - editing again, or to the same text, works", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Edit twice");
    const messageId = await appendText(ctx, threadId, "v1");

    for (const text of ["v2", "v2", "v3"]) {
      const { status } = await ctx.api.aiThreadsUpdateMessage(
        updateRequest(messageId, text),
      );
      expect(status, text).toBe(200);
      expect(await readTexts(ctx, threadId)).toEqual([text]);
    }
    expect((await readAll(ctx, threadId)).map((message) => message.id)).toEqual(
      [messageId],
    );
  });

  test("PUT /api/2.0/ai/threads/update-message - a refused edit leaves the message as it was", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Strict edit");
    const messageId = await appendText(ctx, threadId, "original");
    const clearedThread = await createThread(ctx, "Cleared");
    const clearedMessage = await appendText(ctx, clearedThread, "x");
    await ctx.api.aiThreadsClearMessages({ body: clearedThread });
    const deletedMessage = await appendText(ctx, threadId, "to delete");
    await ctx.api.aiThreadsDeleteMessage({ body: deletedMessage });
    const message = {
      role: "user",
      content: [{ type: "text", text: "changed" }],
    };
    const update = (body: unknown) =>
      ctx.raw.send("owner", "put", "/api/2.0/ai/threads/update-message", body);

    const outcomes: Array<[string, number, number]> = [
      ["no message", 400, (await update({ messageId })).status],
      ["no messageId", 400, (await update({ message })).status],
      [
        "a malformed messageId",
        400,
        (await update({ messageId: MALFORMED_ID, message })).status,
      ],
      [
        "an unknown messageId",
        404,
        (await update({ messageId: UNKNOWN_ID, message })).status,
      ],
      [
        "a deleted message",
        404,
        (await update({ messageId: deletedMessage, message })).status,
      ],
      [
        "a cleared message",
        404,
        (await update({ messageId: clearedMessage, message })).status,
      ],
      ["an empty body", 400, (await update({})).status],
      ["no body at all", 400, (await update(undefined)).status],
    ];

    expect(
      await readTexts(ctx, threadId),
      "the original text survived",
    ).toEqual(["original"]);
    for (const [label, expected, actual] of outcomes) {
      expect(actual, label).toBe(expected);
    }
  });

  test("BUG 84412: PUT /api/2.0/ai/threads/update-message - an empty or whitespace-only text is refused and does not wipe the message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Same defect as an empty append, but destructive: the stored message really
    // is replaced by an empty one (`content: []` for an empty parts list). rename
    // used to do exactly this to a title (BUG 83094, fixed).
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Do not wipe");
    const messageId = await appendText(ctx, threadId, "precious");
    const send = (message: unknown) =>
      ctx.raw.send("owner", "put", "/api/2.0/ai/threads/update-message", {
        messageId,
        message,
      });

    const emptyText = await send({
      role: "user",
      content: [{ type: "text", text: "" }],
    });
    const blankText = await send({
      role: "user",
      content: [{ type: "text", text: "   " }],
    });
    const noParts = await send({ role: "user", content: [] });

    test.fail();
    expect(await readTexts(ctx, threadId), "the message survived").toEqual([
      "precious",
    ]);
    expect(emptyText.status, "an empty text").toBe(400);
    expect(blankText.status, "a whitespace text").toBe(400);
    expect(noParts.status, "an empty parts list").toBe(400);
  });

  test("BUG 84413: PUT /api/2.0/ai/threads/update-message - the role of a stored message cannot be changed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // An edit replaces the content. Here it also lets a user message be turned
    // into an `assistant` one — a model reply nobody ever generated.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Role flip");
    const messageId = await appendText(ctx, threadId, "I am the user");

    const flip = await ctx.raw.send(
      "owner",
      "put",
      "/api/2.0/ai/threads/update-message",
      {
        messageId,
        message: {
          role: "assistant",
          content: [{ type: "text", text: "I am the model" }],
        },
      },
    );
    const stored = (await readAll(ctx, threadId))[0];

    test.fail();
    expect(stored.role, "the role is still user").toBe("user");
    expect(textOf(stored), "the text is still the user's").toBe(
      "I am the user",
    );
    expect(flip.status, "changing the role").toBe(400);
  });

  test("PUT /api/2.0/ai/threads/update-message - reads during a burst of edits only ever see a whole message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Race");
    const messageId = await appendText(ctx, threadId, "v0");
    const versions = ["v1", "v2", "v3", "v4", "v5"];

    const [writes, reads] = await Promise.all([
      Promise.all(
        versions.map((text) =>
          ctx.api.aiThreadsUpdateMessage(updateRequest(messageId, text)),
        ),
      ),
      Promise.all(
        versions.map(() => ctx.api.aiThreadsGetMessageById({ messageId })),
      ),
    ]);
    expect(writes.map((result) => result.status)).toEqual(
      versions.map(() => 200),
    );
    expect(reads.map((result) => result.status)).toEqual(
      versions.map(() => 200),
    );
    // Which version wins is not promised; that it is one of them is.
    for (const read of reads) {
      expect(["v0", ...versions]).toContain(textOf(read.data));
    }
    expect(versions).toContain((await readTexts(ctx, threadId))[0]);
  });
});

// ---------------------------------------------------------------------------
// aiThreadsDeleteMessage

test.describe("DELETE /api/2.0/ai/threads/delete-message - ThreadsApi.aiThreadsDeleteMessage", () => {
  test("DELETE /api/2.0/ai/threads/delete-message - first, middle and last messages go one at a time and the rest keep their order", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Pruning");
    const bystander = await createThread(ctx, "Bystander");
    const ids = [] as string[];
    for (const text of ["a", "b", "c", "d", "e"])
      ids.push(await appendText(ctx, threadId, text));
    await appendText(ctx, bystander, "other");
    const bystanderBefore = await readAll(ctx, bystander);

    const expectState = async (label: string, texts: string[]) => {
      expect(await readTexts(ctx, threadId), label).toEqual(texts);
      const opened = await ctx.aiChat.openOrCreateThread("owner", {
        threadId,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
      });
      expect(
        (opened.data?.priorMessages as Array<{ id: string }>).map((message) =>
          textOf(message as never),
        ),
        `${label} (open-or-create)`,
      ).toEqual(texts);
    };

    // SDK 4.0.0 takes the id as a bare JSON string.
    const first = await ctx.api.aiThreadsDeleteMessage({ body: ids[0] });
    expect(first.status).toBe(200);
    expect(first.data.success).toBe(true);
    await expectState("without the first", ["b", "c", "d", "e"]);

    await ctx.api.aiThreadsDeleteMessage({ body: ids[2] });
    await expectState("without the middle", ["b", "d", "e"]);

    await ctx.api.aiThreadsDeleteMessage({ body: ids[4] });
    await expectState("without the last", ["b", "d"]);

    expect(
      (await ctx.api.aiThreadsGetMessageById({ messageId: ids[0] })).data,
      "a deleted message is no longer served",
    ).toBeNull();
    expect(
      textOf(
        (await ctx.api.aiThreadsGetMessageById({ messageId: ids[1] })).data,
      ),
      "a kept one still is",
    ).toBe("b");
    expect(
      await readAll(ctx, bystander),
      "another thread is untouched",
    ).toEqual(bystanderBefore);
  });

  test("DELETE /api/2.0/ai/threads/delete-message - deleting the only message leaves an empty thread that still exists", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Down to none");
    const messageId = await appendText(ctx, threadId, "the only one");

    const { status } = await ctx.api.aiThreadsDeleteMessage({
      body: messageId,
    });

    expect(status).toBe(200);
    expect(await readAll(ctx, threadId)).toEqual([]);
    expect((await getThread(ctx, threadId)).title).toBe("Down to none");
    expect((await listThreadIds(ctx)).map((thread) => thread.threadId)).toEqual(
      [threadId],
    );
    await appendText(ctx, threadId, "and it takes new ones");
    expect(await readTexts(ctx, threadId)).toEqual(["and it takes new ones"]);
  });

  test("DELETE /api/2.0/ai/threads/delete-message - deleting is idempotent, and a refused id deletes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Idempotent");
    const keep = await appendText(ctx, threadId, "keep");
    const gone = await appendText(ctx, threadId, "gone");

    const once = await ctx.api.aiThreadsDeleteMessage({ body: gone });
    const twice = await ctx.api.aiThreadsDeleteMessage({ body: gone });
    const unknown = await ctx.api.aiThreadsDeleteMessage({ body: UNKNOWN_ID });
    const malformed = await ctx.api.aiThreadsDeleteMessage({
      body: MALFORMED_ID,
    });
    const emptyString = await ctx.raw.sendJsonText(
      "owner",
      "delete",
      "/api/2.0/ai/threads/delete-message",
      "",
    );
    const noBody = await ctx.raw.send(
      "owner",
      "delete",
      "/api/2.0/ai/threads/delete-message",
    );

    expect(await readTexts(ctx, threadId), "only the target went").toEqual([
      "keep",
    ]);
    expect(
      textOf((await ctx.api.aiThreadsGetMessageById({ messageId: keep })).data),
    ).toBe("keep");
    expect(once.status).toBe(200);
    expect(twice.status, "the same id again").toBe(200);
    expect(unknown.status, "an id that never existed").toBe(200);
    expect(malformed.status, "a malformed id").toBe(400);
    expect(emptyString.status, "an empty id").toBe(400);
    expect(noBody.status, "no body").toBe(400);
  });
});
