import { expect } from "@playwright/test";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import {
  MALFORMED_ID,
  UNKNOWN_ID,
  ThreadsCtx,
  appendText,
  sdkProfile,
  createThread,
  expectUuid,
  getThread,
  listThreadIds,
  readAll,
  readTexts,
  snapshotThread,
  textOf,
  threadsSetup,
  waitUntil,
} from "@/src/helpers/ai-threads";

// ThreadsApi, thread-level methods (SDK 4.0.0, docs/AIThreadsApi.md). The
// message-level methods live in src/tests/ai/messages/threads.messages.spec.ts,
// access control in threads.permission.spec.ts, end-to-end flows in
// threads.lifecycle.spec.ts.
//
// What already existed elsewhere and is NOT repeated here (chat.spec.ts,
// chat.permission.spec.ts, chat.ai-disabled.spec.ts):
//   * create:  blank title refused, profile validation in a room, entity scopes
//              (portal / room / folder / agent), per-thread model, 82719/82715.
//   * open-or-create: replay of a long history and of attachments, the profile
//              object being required, the profile not being written, BUG 82826.
//   * list:    ordering, deleted thread leaves, entity scoping, 82855/82858.
//   * rename/delete/clear: validation block (83094, 83095), unreachable-after-
//              delete matrix, clear-then-chat, mid-reply mutations.
//   * regenerate-title: BUG 82828.
//
// Contract notes measured on the live portal (2026-10-09):
//   * `title` must be 1..255 characters on create and rename (256 -> 400);
//     blank / null / non-string titles are 400 on both.
//   * `list` / `read-messages` take a keyset `cursor` that is the JSON of the
//     last received item's sort key. For `list` that is
//     `{"lastEditDate":<ms>,"threadId":"<id>"}`.
//   * `count` of 0 or below is 400 on both routes.
//   * AiThread carries no creation date, so "createdDate is unchanged" is not
//     expressible; `lastEditDate` is the only date.

const BLANK_TITLES: Array<[string, Record<string, unknown>]> = [
  ["no title field", {}],
  ["a null title", { title: null }],
  ["an empty title", { title: "" }],
  ["a whitespace title", { title: "   " }],
  ["a numeric title", { title: 123 }],
  ["an object title", { title: { a: 1 } }],
  ["a title over 255 characters", { title: "a".repeat(256) }],
];

const AWKWARD_TITLES: Array<[string, string]> = [
  ["a single character", "Я"],
  ["Cyrillic", "Привет, мир — отчёт №1"],
  ["emoji", "Plan 😀🚀 done"],
  ["quotes, markup and separators", `He said "hi" <b>&amp;</b> 'x' % _ ; \\ /`],
  ["the maximum length (255)", "t".repeat(255)],
];

async function expectOnlyThreads(
  ctx: ThreadsCtx,
  expectedIds: string[],
  message: string,
) {
  const listed = await listThreadIds(ctx);
  expect(listed.map((thread) => thread.threadId).sort(), message).toEqual(
    [...expectedIds].sort(),
  );
}

// ---------------------------------------------------------------------------
// aiThreadsCreate

test.describe("POST /api/2.0/ai/threads/create - ThreadsApi.aiThreadsCreate", () => {
  test("POST /api/2.0/ai/threads/create - Owner's new thread is readable, listed, empty and keeps what was sent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);

    const first = await createThread(ctx, "Alpha");
    const firstSnapshot = await snapshotThread(ctx, first);

    await test.step("the response carries a real id and get-by-id echoes what was sent", async () => {
      expect(firstSnapshot.thread.threadId).toBe(first);
      expect(firstSnapshot.thread.title).toBe("Alpha");
      expect(firstSnapshot.thread.profileId).toBe(ctx.profileId);
      expect(typeof firstSnapshot.thread.lastEditDate).toBe("number");
      expect(firstSnapshot.thread.lastEditDate).toBeGreaterThan(0);
    });

    await test.step("it is listed in its own scope with the same data", async () => {
      const listed = await listThreadIds(ctx);
      expect(listed).toEqual([firstSnapshot.thread]);
    });

    await test.step("it holds no messages, through every read path", async () => {
      expect(firstSnapshot.messages).toEqual([]);
      const opened = await ctx.aiChat.openOrCreateThread("owner", {
        threadId: first,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
      });
      expect(opened.status).toBe(200);
      expect(opened.data?.priorMessages).toEqual([]);
    });

    await test.step("a second thread with the very same title is allowed, gets its own id, and leaves the first alone", async () => {
      const second = await createThread(ctx, "Alpha");
      expect(second).not.toBe(first);
      expect(await snapshotThread(ctx, first)).toEqual(firstSnapshot);
      await expectOnlyThreads(
        ctx,
        [first, second],
        "both same-titled threads are listed",
      );
      const titles = (await listThreadIds(ctx)).map((thread) => thread.title);
      expect(titles).toEqual(["Alpha", "Alpha"]);
    });

    await test.step("another agent's list does not show them", async () => {
      const otherAgent = await ctx.aiChat.createAgentId("owner", {
        title: "Autotest Other Agent",
        profileId: ctx.profileId,
      });
      const other = await listThreadIds(ctx, { entityId: String(otherAgent) });
      expect(other).toEqual([]);
    });
  });

  for (const [label, title] of AWKWARD_TITLES) {
    test(`POST /api/2.0/ai/threads/create - a title of ${label} is stored verbatim`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await threadsSetup(apiSdk, paymentsApi);

      const threadId = await createThread(ctx, title);

      expect((await getThread(ctx, threadId)).title).toBe(title);
      const listed = await listThreadIds(ctx);
      expect(listed.map((thread) => thread.title)).toEqual([title]);
    });
  }

  test("POST /api/2.0/ai/threads/create - a title the contract refuses creates nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const keeper = await createThread(ctx, "Keeper");

    for (const [label, titleField] of BLANK_TITLES) {
      await test.step(label, async () => {
        const { status } = await ctx.raw.send(
          "owner",
          "post",
          "/api/2.0/ai/threads/create",
          {
            profileId: ctx.profileId,
            entityId: String(ctx.agentId),
            ...titleField,
          },
        );
        expect(status, label).toBe(400);
      });
    }

    // Positive control: the list demonstrably shows threads, and only the keeper.
    await expectOnlyThreads(ctx, [keeper], "no refused create left a thread");
  });

  test("POST /api/2.0/ai/threads/create - an empty body and a body with no JSON are 400", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const keeper = await createThread(ctx, "Keeper");

    const empty = await ctx.raw.send(
      "owner",
      "post",
      "/api/2.0/ai/threads/create",
      {},
    );
    const none = await ctx.raw.send(
      "owner",
      "post",
      "/api/2.0/ai/threads/create",
    );

    await expectOnlyThreads(ctx, [keeper], "nothing was created");
    expect(empty.status, "an empty object").toBe(400);
    expect(none.status, "no body at all").toBe(400);
  });

  test("POST /api/2.0/ai/threads/create - entityId: a missing or null one is the portal-wide scope, a mistyped or unknown one is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const inAgent = await createThread(ctx, "In the agent");

    await test.step("no entityId and a null entityId both open a portal-scope thread outside the agent", async () => {
      const missing = await createThread(ctx, "No entity", { entityId: null });
      const viaRaw = await ctx.raw.send(
        "owner",
        "post",
        "/api/2.0/ai/threads/create",
        { title: "Null entity", profileId: ctx.profileId, entityId: null },
      );
      expect(viaRaw.status).toBe(200);
      const nullId = (viaRaw.data as { threadId: string }).threadId;
      expectUuid(nullId);

      await expectOnlyThreads(ctx, [inAgent], "the agent's list is unchanged");
      const portal = await ctx.api.aiThreadsList({});
      expect(portal.status).toBe(200);
      const ids = portal.data.map((thread) => thread.threadId);
      expect(ids).toEqual(expect.arrayContaining([missing, nullId]));
      expect(ids).not.toContain(inAgent);
    });

    const portalBefore = (await ctx.api.aiThreadsList({})).data.map(
      (thread) => thread.threadId,
    );

    const refused: Array<[string, unknown, number]> = [
      ["a numeric entityId", ctx.agentId, 400],
      ["a malformed entityId", "abc", 404],
      ["an entityId that names nothing", "99999999", 404],
    ];
    for (const [label, entityId, expected] of refused) {
      await test.step(label, async () => {
        const { status } = await ctx.raw.send(
          "owner",
          "post",
          "/api/2.0/ai/threads/create",
          { title: "Refused", profileId: ctx.profileId, entityId },
        );
        expect(status, label).toBe(expected);
      });
    }

    await test.step("none of the refusals left an orphan thread behind", async () => {
      const portalAfter = (await ctx.api.aiThreadsList({})).data.map(
        (thread) => thread.threadId,
      );
      expect(portalAfter.sort()).toEqual(portalBefore.sort());
      await expectOnlyThreads(ctx, [inAgent], "the agent's list is unchanged");
    });
  });

  test("POST /api/2.0/ai/threads/create - a thread can be started in a room, and unknown extra fields are ignored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const { data: room } = await apiSdk.forRole("owner").rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Threads Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = String(room.response!.id!);

    const { status, data } = await ctx.raw.send(
      "owner",
      "post",
      "/api/2.0/ai/threads/create",
      {
        title: "In a room",
        profileId: ctx.profileId,
        entityId: roomId,
        unexpected: "field",
      },
    );
    expect(status).toBe(200);
    const threadId = (data as { threadId: string }).threadId;
    expectUuid(threadId);

    const thread = await getThread(ctx, threadId);
    expect(thread.title).toBe("In a room");
    expect(thread.profileId).toBe(ctx.profileId);
    expect(Object.keys(thread)).not.toContain("unexpected");

    const listed = await listThreadIds(ctx, { entityId: roomId });
    expect(listed.map((item) => item.threadId)).toContain(threadId);
    await expectOnlyThreads(ctx, [], "the agent does not list the room thread");
  });

  test("POST /api/2.0/ai/threads/create - parallel creates all succeed with distinct ids", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);

    const ids = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createThread(ctx, `Parallel ${index}`),
      ),
    );

    expect(new Set(ids).size, "every create got its own id").toBe(8);
    await expectOnlyThreads(ctx, ids, "all eight are listed, none lost");
  });
});

// ---------------------------------------------------------------------------
// aiThreadsOpenOrCreate

test.describe("POST /api/2.0/ai/threads/open-or-create - ThreadsApi.aiThreadsOpenOrCreate", () => {
  test("POST /api/2.0/ai/threads/open-or-create - opening a thread replays exactly what read-messages holds, and opening is read-only", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Replay me");
    const bystander = await createThread(ctx, "Bystander");
    const texts = ["первый", "second\nwith a second line", "третий 😀"];
    for (const text of texts) await appendText(ctx, threadId, text);

    const before = await snapshotThread(ctx, threadId);
    const bystanderBefore = await snapshotThread(ctx, bystander);

    const open = () =>
      ctx.aiChat.openOrCreateThread("owner", {
        threadId,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
        firstMessage: { role: "user", content: [{ type: "text", text: "x" }] },
      });
    const first = await open();
    const second = await open();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data?.threadId).toBe(threadId);
    const replayed = first.data!.priorMessages as Array<{
      id: string;
      role: string;
      createdAt: string;
    }>;
    expect(
      replayed.map((message) => message.id),
      "same ids, same order as read-messages",
    ).toEqual(before.messages.map((message) => message.id));
    expect(replayed.map((message) => textOf(message as never))).toEqual(texts);
    expect(
      second.data?.priorMessages,
      "a repeat open replays the same",
    ).toEqual(first.data?.priorMessages);

    // Read-only: nothing was stored (firstMessage included), nothing duplicated.
    expect(await snapshotThread(ctx, threadId)).toEqual(before);
    expect(await snapshotThread(ctx, bystander)).toEqual(bystanderBefore);
    await expectOnlyThreads(ctx, [threadId, bystander], "no thread was added");
  });

  test("POST /api/2.0/ai/threads/open-or-create - a thread with one message, and one with none, replay as such", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const empty = await createThread(ctx, "Empty");
    const single = await createThread(ctx, "Single");
    const messageId = await appendText(ctx, single, "only one");

    const open = (threadId: string) =>
      ctx.aiChat.openOrCreateThread("owner", {
        threadId,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
      });

    const openedEmpty = await open(empty);
    const openedSingle = await open(single);

    expect(openedEmpty.status).toBe(200);
    expect(openedEmpty.data?.priorMessages).toEqual([]);
    expect(openedSingle.status).toBe(200);
    const prior = openedSingle.data!.priorMessages as Array<{ id: string }>;
    expect(prior.map((message) => message.id)).toEqual([messageId]);
  });

  test("POST /api/2.0/ai/threads/open-or-create - a malformed, unknown or deleted threadId is refused and creates nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const keeper = await createThread(ctx, "Keeper");
    const doomed = await createThread(ctx, "Doomed");
    expect((await ctx.api.aiThreadsDelete({ body: doomed })).status).toBe(200);

    const open = (threadId: unknown) =>
      ctx.raw.send("owner", "post", "/api/2.0/ai/threads/open-or-create", {
        threadId,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
      });

    const cases: Array<[string, unknown, number]> = [
      ["a malformed threadId", MALFORMED_ID, 400],
      ["an unknown threadId", UNKNOWN_ID, 404],
      ["a deleted threadId", doomed, 404],
      ["a numeric threadId", 123, 400],
    ];
    const outcomes: Array<[string, number]> = [];
    for (const [label, threadId] of cases) {
      outcomes.push([label, (await open(threadId)).status]);
    }

    await expectOnlyThreads(ctx, [keeper], "no refusal created a thread");
    for (const [label, , expected] of cases) {
      expect(outcomes.find(([name]) => name === label)![1], label).toBe(
        expected,
      );
    }
  });

  test("POST /api/2.0/ai/threads/open-or-create - an empty body is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const keeper = await createThread(ctx, "Keeper");

    const { status } = await ctx.raw.send(
      "owner",
      "post",
      "/api/2.0/ai/threads/open-or-create",
      {},
    );

    await expectOnlyThreads(ctx, [keeper], "nothing was created");
    // Measured as 404 "an AI profile is required to open or create a thread": the
    // route validates the profile object first.
    expect(status).toBe(404);
  });

  for (const withFirstMessage of [true, false]) {
    test(`BUG 82826: POST /api/2.0/ai/threads/open-or-create - with no threadId a thread is created ${withFirstMessage ? "from the first message" : "empty"}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await threadsSetup(apiSdk, paymentsApi);

      const { status, data } = await ctx.aiChat.openOrCreateThread("owner", {
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
        ...(withFirstMessage
          ? {
              firstMessage: {
                role: "user",
                content: [{ type: "text", text: "First words" }],
              },
            }
          : {}),
      });

      // Whatever the route answers, it must not have half-created anything.
      const listed = await listThreadIds(ctx);

      test.fail();
      expect(status, "the create half of open-or-create").toBe(200);
      expectUuid(data?.threadId, "threadId");
      expect(listed.map((thread) => thread.threadId)).toEqual([data?.threadId]);
      if (withFirstMessage) {
        expect(await readTexts(ctx, data!.threadId!)).toEqual(["First words"]);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// aiThreadsGetById

test.describe("GET /api/2.0/ai/threads/get-by-id - ThreadsApi.aiThreadsGetById", () => {
  test("GET /api/2.0/ai/threads/get-by-id - the thread follows every change made to it, and reading changes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Original");

    const fresh = await getThread(ctx, threadId);
    expect(fresh).toMatchObject({
      threadId,
      title: "Original",
      profileId: ctx.profileId,
    });
    expect(typeof fresh.lastEditDate).toBe("number");

    await test.step("repeated reads are identical", async () => {
      expect(await getThread(ctx, threadId)).toEqual(fresh);
      expect(await getThread(ctx, threadId)).toEqual(fresh);
    });

    await test.step("a thread with history answers the same fields", async () => {
      await appendText(ctx, threadId, "hello");
      const withHistory = await getThread(ctx, threadId);
      expect(withHistory.threadId).toBe(threadId);
      expect(withHistory.title).toBe("Original");
      expect(withHistory.profileId).toBe(ctx.profileId);
    });

    await test.step("after a rename", async () => {
      expect(
        (
          await ctx.api.aiThreadsRename({
            aiThreadsRenameRequest: { threadId, title: "Renamed" },
          })
        ).status,
      ).toBe(200);
      const renamed = await getThread(ctx, threadId);
      expect(renamed.title).toBe("Renamed");
      expect(renamed.threadId).toBe(threadId);
      expect(renamed.profileId).toBe(ctx.profileId);
    });

    await test.step("after clear-messages the thread is still there", async () => {
      expect(
        (await ctx.api.aiThreadsClearMessages({ body: threadId })).status,
      ).toBe(200);
      const cleared = await getThread(ctx, threadId);
      expect(cleared.title).toBe("Renamed");
      expect(cleared.profileId).toBe(ctx.profileId);
    });
  });

  test("GET /api/2.0/ai/threads/get-by-id - unknown, deleted, malformed and missing ids are refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const keeper = await createThread(ctx, "Keeper");
    const doomed = await createThread(ctx, "Doomed");
    expect((await ctx.api.aiThreadsDelete({ body: doomed })).status).toBe(200);

    const unknown = await ctx.api.aiThreadsGetById({ threadId: UNKNOWN_ID });
    const deleted = await ctx.api.aiThreadsGetById({ threadId: doomed });
    const malformed = await ctx.api.aiThreadsGetById({
      threadId: MALFORMED_ID,
    });
    const empty = await ctx.raw.send(
      "owner",
      "get",
      "/api/2.0/ai/threads/get-by-id?threadId=",
    );
    const missing = await ctx.raw.send(
      "owner",
      "get",
      "/api/2.0/ai/threads/get-by-id",
    );

    // Positive control: the same route still serves a live thread.
    expect((await getThread(ctx, keeper)).title).toBe("Keeper");

    expect(unknown.status, "unknown id").toBe(404);
    expect(deleted.status, "deleted thread").toBe(404);
    expect(malformed.status, "malformed id").toBe(400);
    expect(empty.status, "empty id").toBe(400);
    expect(missing.status, "missing id").toBe(400);
  });
});

// ---------------------------------------------------------------------------
// aiThreadsList

test.describe("GET /api/2.0/ai/threads/list - ThreadsApi.aiThreadsList", () => {
  test("GET /api/2.0/ai/threads/list - the list mirrors get-by-id and follows rename, clear and delete", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);

    expect(await listThreadIds(ctx), "an agent with no threads").toEqual([]);

    const a = await createThread(ctx, "Thread A");
    const b = await createThread(ctx, "Thread B");
    await appendText(ctx, b, "history");

    await test.step("every item equals what get-by-id says", async () => {
      const listed = await listThreadIds(ctx);
      expect(listed).toHaveLength(2);
      for (const item of listed) {
        expect(item).toEqual(await getThread(ctx, item.threadId));
      }
    });

    await test.step("a rename shows in the list", async () => {
      await ctx.api.aiThreadsRename({
        aiThreadsRenameRequest: { threadId: a, title: "Thread A renamed" },
      });
      const titles = Object.fromEntries(
        (await listThreadIds(ctx)).map((item) => [item.threadId, item.title]),
      );
      expect(titles).toEqual({ [a]: "Thread A renamed", [b]: "Thread B" });
    });

    await test.step("clear-messages keeps the thread in the list", async () => {
      await ctx.api.aiThreadsClearMessages({ body: b });
      await expectOnlyThreads(ctx, [a, b], "cleared thread stays listed");
    });

    await test.step("delete removes exactly that thread", async () => {
      await ctx.api.aiThreadsDelete({ body: a });
      await expectOnlyThreads(ctx, [b], "only the deleted thread went");
    });
  });

  test("GET /api/2.0/ai/threads/list - count caps the page, and a count of 0 or below is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    for (const title of ["One", "Two", "Three", "Four"])
      await createThread(ctx, title);
    const everything = await listThreadIds(ctx);
    expect(everything).toHaveLength(4);

    const entityId = String(ctx.agentId);
    const one = await ctx.api.aiThreadsList({ entityId, count: 1 });
    const three = await ctx.api.aiThreadsList({ entityId, count: 3 });
    const exact = await ctx.api.aiThreadsList({ entityId, count: 4 });
    const over = await ctx.api.aiThreadsList({ entityId, count: 100 });
    const zero = await ctx.api.aiThreadsList({ entityId, count: 0 });
    const negative = await ctx.api.aiThreadsList({ entityId, count: -1 });

    expect(one.status).toBe(200);
    expect(one.data, "count=1 is the newest one").toEqual(
      everything.slice(0, 1),
    );
    expect(three.data, "count=3 is the three newest").toEqual(
      everything.slice(0, 3),
    );
    expect(exact.data, "count equal to the total").toEqual(everything);
    expect(over.data, "count above the total").toEqual(everything);
    expect(zero.status, "count=0").toBe(400);
    expect(negative.status, "count=-1").toBe(400);
  });

  test("GET /api/2.0/ai/threads/list - walking the pages by cursor visits every thread once", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The cursor is documented only as "the JSON-encoded sort key of the last item
    // already received". For this route that key is {lastEditDate, threadId}.
    // Threads are created back to back on purpose: several land in the same
    // second, which is exactly where a keyset cursor without a tie-breaker would
    // repeat or skip an item.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    for (let index = 0; index < 5; index++)
      await createThread(ctx, `Paged ${index}`);
    const everything = await listThreadIds(ctx);
    expect(everything).toHaveLength(5);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 6; page++) {
      const { status, data } = await ctx.api.aiThreadsList({
        entityId: String(ctx.agentId),
        count: 2,
        cursor,
      });
      expect(status, `page ${page}`).toBe(200);
      if (data.length === 0) break;
      seen.push(...data.map((thread) => thread.threadId));
      const last = data[data.length - 1];
      cursor = JSON.stringify({
        lastEditDate: last.lastEditDate,
        threadId: last.threadId,
      });
    }

    expect(seen, "pages concatenate to the unpaged list").toEqual(
      everything.map((thread) => thread.threadId),
    );
  });

  test("GET /api/2.0/ai/threads/list - query is a case-insensitive substring match on the title and treats % and _ literally", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const report = await createThread(ctx, "Quarterly Report");
    const reportRu = await createThread(ctx, "Отчёт за квартал");
    const percent = await createThread(ctx, "100% done");
    const underscore = await createThread(ctx, "snake_case");
    const plain = await createThread(ctx, "Something else");

    const ids = async (query: string) =>
      (await listThreadIds(ctx, { query })).map((thread) => thread.threadId);

    expect(await ids("Quarterly Report"), "the exact title").toEqual([report]);
    expect(await ids("Report"), "part of a title").toEqual([report]);
    expect(await ids("quarterly"), "another case").toEqual([report]);
    expect(await ids("ОТЧЁТ"), "Cyrillic in another case").toEqual([reportRu]);
    expect(await ids("nothing-has-this"), "no match").toEqual([]);
    expect(await ids("%"), "% is not a wildcard").toEqual([percent]);
    expect(await ids("_"), "_ is not a wildcard").toEqual([underscore]);
    expect((await ids("e")).sort(), "a letter many titles share").toEqual(
      [report, percent, underscore, plain].sort(),
    );

    const withCount = await listThreadIds(ctx, { query: "e", count: 1 });
    expect(withCount, "query and count together").toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// aiThreadsRename

test.describe("PUT /api/2.0/ai/threads/rename - ThreadsApi.aiThreadsRename", () => {
  test("PUT /api/2.0/ai/threads/rename - Owner renames a thread and nothing else about it changes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Before");
    const sibling = await createThread(ctx, "Sibling");
    await appendText(ctx, threadId, "kept through the rename");
    const before = await snapshotThread(ctx, threadId);
    const siblingBefore = await snapshotThread(ctx, sibling);

    const { status, data } = await ctx.api.aiThreadsRename({
      aiThreadsRenameRequest: { threadId, title: "After" },
    });

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    const after = await snapshotThread(ctx, threadId);
    expect(after.thread.title).toBe("After");
    expect(after.thread.threadId).toBe(threadId);
    expect(after.thread.profileId).toBe(before.thread.profileId);
    expect(after.messages, "the history is untouched").toEqual(before.messages);
    expect(
      await snapshotThread(ctx, sibling),
      "a sibling is untouched",
    ).toEqual(siblingBefore);
    expect(
      (await listThreadIds(ctx)).find((item) => item.threadId === threadId)
        ?.title,
    ).toBe("After");
  });

  test("PUT /api/2.0/ai/threads/rename - renaming twice, to the same title, or to a sibling's title all work", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const a = await createThread(ctx, "A");
    const b = await createThread(ctx, "B");
    const rename = (threadId: string, title: string) =>
      ctx.api.aiThreadsRename({ aiThreadsRenameRequest: { threadId, title } });

    expect((await rename(a, "Second")).status).toBe(200);
    expect((await rename(a, "Third")).status).toBe(200);
    expect((await getThread(ctx, a)).title).toBe("Third");

    expect((await rename(a, "Third")).status, "to the title it has").toBe(200);
    expect((await getThread(ctx, a)).title).toBe("Third");

    expect((await rename(b, "Third")).status, "to a sibling's title").toBe(200);
    const titles = (await listThreadIds(ctx)).map((thread) => thread.title);
    expect(titles).toEqual(["Third", "Third"]);
  });

  for (const [label, title] of AWKWARD_TITLES) {
    test(`PUT /api/2.0/ai/threads/rename - a title of ${label} is stored verbatim`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await threadsSetup(apiSdk, paymentsApi);
      const threadId = await createThread(ctx, "Plain");

      const { status } = await ctx.api.aiThreadsRename({
        aiThreadsRenameRequest: { threadId, title },
      });

      expect(status).toBe(200);
      expect((await getThread(ctx, threadId)).title).toBe(title);
    });
  }

  test("PUT /api/2.0/ai/threads/rename - a refused title or thread id leaves the name alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Untouchable");
    const doomed = await createThread(ctx, "Doomed");
    expect((await ctx.api.aiThreadsDelete({ body: doomed })).status).toBe(200);
    const rename = (body: unknown) =>
      ctx.raw.send("owner", "put", "/api/2.0/ai/threads/rename", body);

    const outcomes: Array<[string, number, number]> = [];
    for (const [label, titleField] of BLANK_TITLES) {
      outcomes.push([
        label,
        400,
        (await rename({ threadId, ...titleField })).status,
      ]);
    }
    outcomes.push(
      ["no threadId", 400, (await rename({ title: "X" })).status],
      ["an empty body", 400, (await rename({})).status],
      ["no body at all", 400, (await rename(undefined)).status],
      [
        "a malformed threadId",
        400,
        (await rename({ threadId: MALFORMED_ID, title: "X" })).status,
      ],
      [
        "an unknown threadId",
        404,
        (await rename({ threadId: UNKNOWN_ID, title: "X" })).status,
      ],
      [
        "a deleted threadId",
        404,
        (await rename({ threadId: doomed, title: "X" })).status,
      ],
    );

    // Side effects first, statuses after.
    expect((await getThread(ctx, threadId)).title).toBe("Untouchable");
    await expectOnlyThreads(ctx, [threadId], "no thread appeared or vanished");
    for (const [label, expected, actual] of outcomes) {
      expect(actual, label).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// aiThreadsRegenerateTitle

test.describe("POST /api/2.0/ai/threads/regenerate-title - ThreadsApi.aiThreadsRegenerateTitle", () => {
  test("POST /api/2.0/ai/threads/regenerate-title - a malformed, unknown, deleted or incomplete request is refused and the title stays", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Keep my name");
    await appendText(ctx, threadId, "Something to title");
    const doomed = await createThread(ctx, "Doomed");
    expect((await ctx.api.aiThreadsDelete({ body: doomed })).status).toBe(200);
    const regenerate = (body: unknown) =>
      ctx.raw.send(
        "owner",
        "post",
        "/api/2.0/ai/threads/regenerate-title",
        body,
      );

    const outcomes: Array<[string, number, number]> = [
      [
        "a malformed threadId",
        400,
        (await regenerate({ threadId: MALFORMED_ID, profile: ctx.profile }))
          .status,
      ],
      [
        "an unknown threadId",
        404,
        (await regenerate({ threadId: UNKNOWN_ID, profile: ctx.profile }))
          .status,
      ],
      [
        "a deleted threadId",
        404,
        (await regenerate({ threadId: doomed, profile: ctx.profile })).status,
      ],
      ["no threadId", 400, (await regenerate({ profile: ctx.profile })).status],
      ["no profile object", 400, (await regenerate({ threadId })).status],
      [
        "a profileId instead of the profile object",
        400,
        (await regenerate({ threadId, profileId: ctx.profileId })).status,
      ],
      ["an empty body", 400, (await regenerate({})).status],
    ];

    expect((await getThread(ctx, threadId)).title).toBe("Keep my name");
    for (const [label, expected, actual] of outcomes) {
      expect(actual, label).toBe(expected);
    }
  });

  test("BUG 82828: POST /api/2.0/ai/threads/regenerate-title - the generated title is returned, stored and listed, and a repeat works", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The generated wording is the model's business and is not asserted — only
    // that there is one, that it is what the thread is now called, and that the
    // route can be called again.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Title me");
    await ctx.aiChat.sendMessage("owner", {
      threadId,
      profileId: ctx.profileId,
      agentId: ctx.agentId,
      message: "Explain gravity in one sentence.",
    });
    const messages = await ctx.aiChat.waitForAssistantReply("owner", threadId);
    expect(AiAgentChat.assistantMessages(messages).length).toBeGreaterThan(0);

    const first = await ctx.api.aiThreadsRegenerateTitle({
      aiThreadsRegenerateTitleRequest: { threadId, profile: sdkProfile(ctx) },
    });
    const stored = (await getThread(ctx, threadId)).title;
    const listed = (await listThreadIds(ctx)).find(
      (thread) => thread.threadId === threadId,
    )?.title;
    const second = await ctx.api.aiThreadsRegenerateTitle({
      aiThreadsRegenerateTitleRequest: { threadId, profile: sdkProfile(ctx) },
    });

    test.fail();
    expect(first.status, "regenerating the title").toBe(200);
    expect(first.data.title.trim(), "a non-empty title comes back").not.toBe(
      "",
    );
    expect(first.data.title).not.toBe("Title me");
    expect(stored, "get-by-id carries the generated title").toBe(
      first.data.title,
    );
    expect(listed, "list carries it too").toBe(first.data.title);
    expect(second.status, "a repeat regenerate").toBe(200);
  });
});

// ---------------------------------------------------------------------------
// aiThreadsTouch

test.describe("POST /api/2.0/ai/threads/touch - ThreadsApi.aiThreadsTouch", () => {
  test("POST /api/2.0/ai/threads/touch - touching advances lastEditDate and changes nothing else, empty thread or not", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const empty = await createThread(ctx, "Empty");
    const withHistory = await createThread(ctx, "With history");
    await appendText(ctx, withHistory, "one");
    await appendText(ctx, withHistory, "two");

    for (const threadId of [empty, withHistory]) {
      const before = await snapshotThread(ctx, threadId);

      // lastEditDate has one-second granularity, so a touch in the same second as
      // the previous edit is invisible. Touch until the clock has moved on.
      const lastEditDate = async () =>
        (await getThread(ctx, threadId)).lastEditDate!;
      let results: number[] = [];
      const observed = await waitUntil(
        async () => {
          const touched = await ctx.api.aiThreadsTouch({
            aiThreadsTouchRequest: { threadId },
          });
          results.push(touched.status);
          return lastEditDate();
        },
        (date) => date > before.thread.lastEditDate!,
        { timeoutMs: 20000, intervalMs: 700 },
      );

      expect(
        results.every((code) => code === 200),
        "every touch answered 200",
      ).toBe(true);
      expect(observed, "lastEditDate moved forward").toBeGreaterThan(
        before.thread.lastEditDate!,
      );
      const after = await snapshotThread(ctx, threadId);
      expect(after.thread.title).toBe(before.thread.title);
      expect(after.thread.profileId).toBe(before.thread.profileId);
      expect(after.messages, "the history is untouched").toEqual(
        before.messages,
      );
      results = [];
    }
  });

  test("POST /api/2.0/ai/threads/touch - a touch never moves lastEditDate back, and a repeat is harmless", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Touched twice");

    const dates: number[] = [(await getThread(ctx, threadId)).lastEditDate!];
    for (let round = 0; round < 3; round++) {
      const { status, data } = await ctx.api.aiThreadsTouch({
        aiThreadsTouchRequest: { threadId },
      });
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      dates.push((await getThread(ctx, threadId)).lastEditDate!);
    }

    for (let index = 1; index < dates.length; index++) {
      expect(
        dates[index],
        `date ${index} vs ${index - 1}`,
      ).toBeGreaterThanOrEqual(dates[index - 1]);
    }
    await expectOnlyThreads(ctx, [threadId], "no thread was added");
  });

  test("POST /api/2.0/ai/threads/touch - a malformed, unknown, deleted or missing id is refused and nothing changes", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Bystander");
    const doomed = await createThread(ctx, "Doomed");
    expect((await ctx.api.aiThreadsDelete({ body: doomed })).status).toBe(200);
    const before = await snapshotThread(ctx, threadId);
    const touch = (body: unknown) =>
      ctx.raw.send("owner", "post", "/api/2.0/ai/threads/touch", body);

    const outcomes: Array<[string, number, number]> = [
      [
        "a malformed threadId",
        400,
        (await touch({ threadId: MALFORMED_ID })).status,
      ],
      [
        "an unknown threadId",
        404,
        (await touch({ threadId: UNKNOWN_ID })).status,
      ],
      ["a deleted threadId", 404, (await touch({ threadId: doomed })).status],
      ["no threadId", 400, (await touch({})).status],
      ["no body at all", 400, (await touch(undefined)).status],
    ];

    expect(await snapshotThread(ctx, threadId)).toEqual(before);
    await expectOnlyThreads(ctx, [threadId], "nothing appeared or vanished");
    for (const [label, expected, actual] of outcomes) {
      expect(actual, label).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// aiThreadsDelete

test.describe("DELETE /api/2.0/ai/threads/delete - ThreadsApi.aiThreadsDelete", () => {
  test("DELETE /api/2.0/ai/threads/delete - deleting a thread with a history takes it and its messages, and no other thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const doomed = await createThread(ctx, "Doomed");
    const survivor = await createThread(ctx, "Survivor");
    const doomedMessage = await appendText(ctx, doomed, "gone with the thread");
    await appendText(ctx, survivor, "stays");
    const survivorBefore = await snapshotThread(ctx, survivor);
    const emptyDoomed = await createThread(ctx, "Empty doomed");

    // SDK 4.0.0 takes the id as a bare JSON string.
    const { status, data } = await ctx.api.aiThreadsDelete({ body: doomed });
    const emptyResult = await ctx.api.aiThreadsDelete({ body: emptyDoomed });

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(emptyResult.status, "an empty thread deletes too").toBe(200);
    await expectOnlyThreads(ctx, [survivor], "only the survivor is listed");
    expect(
      await snapshotThread(ctx, survivor),
      "the survivor is untouched",
    ).toEqual(survivorBefore);
    expect((await ctx.api.aiThreadsGetById({ threadId: doomed })).status).toBe(
      404,
    );
    expect(
      (await ctx.api.aiThreadsReadMessages({ threadId: doomed })).status,
    ).toBe(404);
    expect(
      (await ctx.api.aiThreadsGetMessageById({ messageId: doomedMessage }))
        .data,
      "its message is no longer served",
    ).toBeNull();
  });

  test("DELETE /api/2.0/ai/threads/delete - a body with no id is refused and deletes nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const keeper = await createThread(ctx, "Keeper");
    const del = (body?: unknown) =>
      ctx.raw.send("owner", "delete", "/api/2.0/ai/threads/delete", body);

    const noBody = await del();
    const empty = await del({});
    const malformed = await ctx.api.aiThreadsDelete({ body: MALFORMED_ID });
    const unknown = await ctx.api.aiThreadsDelete({ body: UNKNOWN_ID });

    await expectOnlyThreads(ctx, [keeper], "nothing was deleted");
    expect(noBody.status, "no body").toBe(400);
    expect(empty.status, "an empty object").toBe(400);
    expect(malformed.status, "a malformed id").toBe(400);
    expect(unknown.status, "an id that never existed").toBe(404);
  });
});

// ---------------------------------------------------------------------------
// aiThreadsClearMessages

test.describe("DELETE /api/2.0/ai/threads/clear-messages - ThreadsApi.aiThreadsClearMessages", () => {
  test("DELETE /api/2.0/ai/threads/clear-messages - a cleared thread is empty everywhere, keeps its identity, and starts a new history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "To clear");
    const other = await createThread(ctx, "Not cleared");
    const oldIds = [
      await appendText(ctx, threadId, "old one"),
      await appendText(ctx, threadId, "old two"),
      await appendText(ctx, threadId, "old three"),
    ];
    await appendText(ctx, other, "bystander message");
    const otherBefore = await snapshotThread(ctx, other);
    const identityBefore = await getThread(ctx, threadId);

    const { status, data } = await ctx.api.aiThreadsClearMessages({
      body: threadId,
    });

    expect(status).toBe(200);
    expect(data.success).toBe(true);

    await test.step("every read path is empty", async () => {
      expect(await readAll(ctx, threadId)).toEqual([]);
      const opened = await ctx.aiChat.openOrCreateThread("owner", {
        threadId,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
      });
      expect(opened.data?.priorMessages).toEqual([]);
      for (const messageId of oldIds) {
        const read = await ctx.api.aiThreadsGetMessageById({ messageId });
        expect(read.data, `message ${messageId} is gone`).toBeNull();
      }
    });

    await test.step("the thread itself survives with the same identity", async () => {
      const identityAfter = await getThread(ctx, threadId);
      expect(identityAfter.title).toBe(identityBefore.title);
      expect(identityAfter.profileId).toBe(identityBefore.profileId);
      await expectOnlyThreads(ctx, [threadId, other], "still listed");
    });

    await test.step("a bystander thread is untouched", async () => {
      expect(await snapshotThread(ctx, other)).toEqual(otherBefore);
    });

    await test.step("new messages build a fresh history without the old one", async () => {
      await appendText(ctx, threadId, "brand new");
      expect(await readTexts(ctx, threadId)).toEqual(["brand new"]);
    });
  });

  test("DELETE /api/2.0/ai/threads/clear-messages - a body with no id is refused and clears nothing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Full thread");
    await appendText(ctx, threadId, "must survive");
    const before = await snapshotThread(ctx, threadId);
    const clear = (body?: unknown) =>
      ctx.raw.send(
        "owner",
        "delete",
        "/api/2.0/ai/threads/clear-messages",
        body,
      );

    const noBody = await clear();
    const empty = await clear({});

    expect(await snapshotThread(ctx, threadId)).toEqual(before);
    expect(noBody.status, "no body").toBe(400);
    expect(empty.status, "an empty object").toBe(400);
  });
});
