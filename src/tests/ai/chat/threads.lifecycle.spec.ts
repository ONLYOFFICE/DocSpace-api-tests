import { expect } from "@playwright/test";
import { FileType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { AiAttachments } from "@/src/helpers/ai-attachments";
import {
  AiAgentChat,
  AiThreadMessage,
  expectHealthyAssistantReply,
  inviteToAgent,
} from "@/src/helpers/ai-agent-chat";
import {
  UNKNOWN_ID,
  appendText,
  appendedMessage,
  createThread,
  expectUuid,
  getThread,
  listThreadIds,
  readAll,
  readTexts,
  sdkProfile,
  snapshotThread,
  textOf,
  threadsSetup,
} from "@/src/helpers/ai-threads";

// End-to-end flows over ThreadsApi. Every step is checked through a method other
// than the one that made the change, so a handler that answers 200 and does
// nothing cannot pass.

test.describe("Threads - lifecycle", () => {
  test("ThreadsApi - create, write, read, edit, rename, touch, prune, clear and delete a thread, each step confirmed by another route", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const api = ctx.api;
    let threadId = "";
    const ids: string[] = [];

    await test.step("create", async () => {
      threadId = await createThread(ctx, "Lifecycle");
      expect((await getThread(ctx, threadId)).title).toBe("Lifecycle");
      expect(
        (await listThreadIds(ctx)).map((thread) => thread.threadId),
      ).toEqual([threadId]);
    });

    await test.step("append-user-message ×3, confirmed by read-messages and get-message-by-id", async () => {
      for (const text of ["one", "two", "three"]) {
        ids.push(await appendText(ctx, threadId, text));
      }
      const read = await readAll(ctx, threadId);
      expect(read.map((message) => message.id)).toEqual(ids);
      for (const [index, id] of ids.entries()) {
        const single = await api.aiThreadsGetMessageById({ messageId: id });
        expect(single.data).toEqual(read[index]);
      }
    });

    await test.step("update-message, confirmed by get-message-by-id and read-messages", async () => {
      const { status } = await api.aiThreadsUpdateMessage({
        aiThreadsUpdateMessageRequest: {
          messageId: ids[1],
          message: {
            role: "user",
            content: [{ type: "text", text: "two, edited" }],
          },
        },
      });
      expect(status).toBe(200);
      expect(
        textOf((await api.aiThreadsGetMessageById({ messageId: ids[1] })).data),
      ).toBe("two, edited");
      expect(await readTexts(ctx, threadId)).toEqual([
        "one",
        "two, edited",
        "three",
      ]);
    });

    await test.step("rename, confirmed by get-by-id and list", async () => {
      expect(
        (
          await api.aiThreadsRename({
            aiThreadsRenameRequest: { threadId, title: "Lifecycle renamed" },
          })
        ).status,
      ).toBe(200);
      expect((await getThread(ctx, threadId)).title).toBe("Lifecycle renamed");
      expect((await listThreadIds(ctx))[0].title).toBe("Lifecycle renamed");
    });

    await test.step("touch, confirmed by the date and by the history being untouched", async () => {
      const before = await snapshotThread(ctx, threadId);
      expect(
        (await api.aiThreadsTouch({ aiThreadsTouchRequest: { threadId } }))
          .status,
      ).toBe(200);
      const after = await snapshotThread(ctx, threadId);
      expect(after.thread.lastEditDate).toBeGreaterThanOrEqual(
        before.thread.lastEditDate!,
      );
      expect(after.messages).toEqual(before.messages);
    });

    await test.step("delete-message, confirmed by read-messages and open-or-create", async () => {
      expect((await api.aiThreadsDeleteMessage({ body: ids[0] })).status).toBe(
        200,
      );
      expect(await readTexts(ctx, threadId)).toEqual(["two, edited", "three"]);
      const opened = await ctx.aiChat.openOrCreateThread("owner", {
        threadId,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
      });
      expect(
        (opened.data?.priorMessages as Array<{ id: string }>).map(
          (message) => message.id,
        ),
      ).toEqual([ids[1], ids[2]]);
    });

    await test.step("clear-messages, confirmed by read-messages; the thread stays", async () => {
      expect(
        (await api.aiThreadsClearMessages({ body: threadId })).status,
      ).toBe(200);
      expect(await readAll(ctx, threadId)).toEqual([]);
      expect((await getThread(ctx, threadId)).title).toBe("Lifecycle renamed");
    });

    await test.step("delete, confirmed by list and by every route answering 404", async () => {
      expect((await api.aiThreadsDelete({ body: threadId })).status).toBe(200);
      expect(await listThreadIds(ctx)).toEqual([]);
      expect((await api.aiThreadsGetById({ threadId })).status).toBe(404);
      expect((await api.aiThreadsReadMessages({ threadId })).status).toBe(404);
      expect(
        (
          await api.aiThreadsRename({
            aiThreadsRenameRequest: { threadId, title: "x" },
          })
        ).status,
      ).toBe(404);
      expect(
        (await api.aiThreadsClearMessages({ body: threadId })).status,
      ).toBe(404);
      expect(
        (await api.aiThreadsTouch({ aiThreadsTouchRequest: { threadId } }))
          .status,
      ).toBe(404);
    });
  });

  test("ThreadsApi - a thread opened by its first message is a real thread to every other route, and a second message continues it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const question = "What is the capital of France? Answer in one word.";

    let threadId = "";
    let afterFirstTurn: AiThreadMessage[] = [];

    await test.step("send-with-stream with no threadId opens a thread and answers", async () => {
      expect(await listThreadIds(ctx), "the agent starts empty").toEqual([]);
      const sent = await ctx.raw.send(
        "owner",
        "post",
        "/api/2.0/ai/ai/send-with-stream",
        {
          entityId: String(ctx.agentId),
          profileId: ctx.profileId,
          userMessage: {
            role: "user",
            content: [{ type: "text", text: question }],
          },
        },
      );
      expect(sent.status).toBe(200);
      expect(AiAgentChat.streamError(sent.text)).toBeUndefined();
      const frames = AiAgentChat.streamFrames(sent.text);
      expect(frames[0].type).toBe("thread-title");
      threadId = frames[0].threadId as string;
      expectUuid(threadId, "the id announced in the opening frame");
      afterFirstTurn = await ctx.aiChat.waitForAssistantReply(
        "owner",
        threadId,
      );
      expectHealthyAssistantReply(afterFirstTurn);
    });

    await test.step("get-by-id and list know the thread", async () => {
      const thread = await getThread(ctx, threadId);
      expect(thread.threadId).toBe(threadId);
      expect(thread.profileId).toBe(ctx.profileId);
      const listed = await listThreadIds(ctx);
      expect(listed.map((item) => item.threadId)).toEqual([threadId]);
      expect(listed[0].title).toBe(thread.title);
    });

    await test.step("read-messages, open-or-create and get-message-by-id agree on the two messages", async () => {
      const read = await readAll(ctx, threadId);
      expect(read.map((message) => message.role)).toEqual([
        "user",
        "assistant",
      ]);
      expect(textOf(read[0])).toBe(question);
      const opened = await ctx.aiChat.openOrCreateThread("owner", {
        threadId,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
      });
      expect(opened.status).toBe(200);
      expect(
        (opened.data?.priorMessages as Array<{ id: string }>).map(
          (message) => message.id,
        ),
      ).toEqual(read.map((message) => message.id));
      for (const message of read) {
        const single = await ctx.api.aiThreadsGetMessageById({
          messageId: message.id!,
        });
        expect(single.data).toEqual(message);
      }
    });

    await test.step("a second message in the same thread keeps the first turn", async () => {
      await ctx.aiChat.sendMessage("owner", {
        threadId,
        profileId: ctx.profileId,
        agentId: ctx.agentId,
        message: "Say OK.",
      });
      const messages = await ctx.aiChat.waitForAssistantReplies(
        "owner",
        threadId,
        2,
      );
      expectHealthyAssistantReply(messages, 2);
      expect(messages.slice(0, 2).map((message) => message.id)).toEqual(
        afterFirstTurn.map((message) => message.id),
      );
      expect(messages.map((message) => message.role)).toEqual([
        "user",
        "assistant",
        "user",
        "assistant",
      ]);
      expect((await listThreadIds(ctx)).map((item) => item.threadId)).toEqual([
        threadId,
      ]);
    });

    await test.step("an empty threadId is another new thread, not this one", async () => {
      const sent = await ctx.raw.send(
        "owner",
        "post",
        "/api/2.0/ai/ai/send-with-stream",
        {
          threadId: "",
          entityId: String(ctx.agentId),
          profileId: ctx.profileId,
          userMessage: {
            role: "user",
            content: [{ type: "text", text: "Say OK." }],
          },
        },
      );
      expect(sent.status).toBe(200);
      const second = AiAgentChat.streamFrames(sent.text)[0].threadId as string;
      expect(second).not.toBe(threadId);
      const listed = (await listThreadIds(ctx)).map((item) => item.threadId);
      expect(listed.sort()).toEqual([threadId, second].sort());
    });
  });

  test("ThreadsApi - the model's own reply can be read, rewritten and deleted like any message, and clearing removes both turns", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Reply handling");
    await ctx.aiChat.sendMessage("owner", {
      threadId,
      profileId: ctx.profileId,
      agentId: ctx.agentId,
      message: "Say OK.",
    });
    const messages = await ctx.aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);
    const reply = AiAgentChat.assistantMessages(messages)[0];

    const asAssistant = await ctx.api.aiThreadsGetMessageById({
      messageId: reply.id,
    });
    expect(asAssistant.data.role).toBe("assistant");
    expect(asAssistant.data.id).toBe(reply.id);
    expect(textOf(asAssistant.data)).toBe(AiAgentChat.messageText(reply));

    await test.step("an assistant message can be rewritten in place and keeps its role and position", async () => {
      const { status } = await ctx.api.aiThreadsUpdateMessage({
        aiThreadsUpdateMessageRequest: {
          messageId: reply.id,
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Edited reply" }],
          },
        },
      });
      const after = await readAll(ctx, threadId);
      expect(after.map((message) => message.id)).toEqual(
        messages.map((message) => message.id),
      );
      expect(after[1].role).toBe("assistant");
      expect(textOf(after[1])).toBe("Edited reply");
      expect(status).toBe(200);
    });

    await test.step("deleting the reply leaves the question", async () => {
      expect(
        (await ctx.api.aiThreadsDeleteMessage({ body: reply.id })).status,
      ).toBe(200);
      const left = await readAll(ctx, threadId);
      expect(left.map((message) => message.role)).toEqual(["user"]);
    });

    await test.step("clear-messages removes the rest", async () => {
      expect(
        (await ctx.api.aiThreadsClearMessages({ body: threadId })).status,
      ).toBe(200);
      expect(await readAll(ctx, threadId)).toEqual([]);
    });
  });

  test("ThreadsApi - two users in one agent each keep a private thread, and neither side can reach the other's", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const ownerThread = await createThread(ctx, "Owner's");
    await appendText(ctx, ownerThread, "owner secret");
    const ownerBefore = await snapshotThread(ctx, ownerThread);

    const ownerApi = apiSdk.forRole("owner");
    const {
      data: member,
      userData,
      api,
    } = await apiSdk.addAuthenticatedMember("owner", "User");
    await inviteToAgent(ownerApi.rooms, ctx.agentId, member.response!.id!);
    const memberClient = api.chat;

    const memberThread = await createThread(ctx, "Member's", {}, memberClient);
    await appendText(ctx, memberThread, "member secret", memberClient);
    const memberBefore = await snapshotThread(ctx, memberThread, memberClient);

    await test.step("the member cannot read, change or remove the owner's thread", async () => {
      expect(
        (await memberClient.aiThreadsGetById({ threadId: ownerThread })).status,
      ).toBe(403);
      expect(
        (await memberClient.aiThreadsReadMessages({ threadId: ownerThread }))
          .status,
      ).toBe(403);
      expect(
        (
          await memberClient.aiThreadsRename({
            aiThreadsRenameRequest: { threadId: ownerThread, title: "x" },
          })
        ).status,
      ).toBe(403);
      expect(
        (await memberClient.aiThreadsClearMessages({ body: ownerThread }))
          .status,
      ).toBe(403);
      expect(
        (await memberClient.aiThreadsDelete({ body: ownerThread })).status,
      ).toBe(403);
    });

    await test.step("the member's own list holds only the member's thread", async () => {
      const mine = await listThreadIds(ctx, {}, memberClient);
      expect(mine.map((thread) => thread.threadId)).toEqual([memberThread]);
    });

    await apiSdk.authenticateOwner();

    await test.step("the owner's data is unchanged, and the owner's list holds only the owner's thread", async () => {
      expect(await snapshotThread(ctx, ownerThread)).toEqual(ownerBefore);
      expect(
        (await listThreadIds(ctx)).map((thread) => thread.threadId),
      ).toEqual([ownerThread]);
    });

    await test.step("the owner of the agent has no back door into the member's thread either", async () => {
      const readByOwner = await ctx.api.aiThreadsGetById({
        threadId: memberThread,
      });
      const messagesByOwner = await ctx.api.aiThreadsReadMessages({
        threadId: memberThread,
      });
      expect(readByOwner.status).toBe(403);
      expect(messagesByOwner.status).toBe(403);
    });

    await apiSdk.authenticateMember(userData, "User");
    await test.step("and the member's thread is exactly what it was", async () => {
      expect(await snapshotThread(ctx, memberThread, memberClient)).toEqual(
        memberBefore,
      );
    });
  });

  test("ThreadsApi - threads of two agents never mix: changing or deleting one leaves the other whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const otherAgent = String(
      await ctx.aiChat.createAgentId("owner", {
        title: "Autotest Second Agent",
        profileId: ctx.profileId,
      }),
    );
    const first = await createThread(ctx, "First agent thread");
    const second = await createThread(ctx, "Second agent thread", {
      entityId: otherAgent,
    });
    const firstMessage = await appendText(ctx, first, "in the first agent");
    await appendText(ctx, second, "in the second agent");
    const secondBefore = await snapshotThread(ctx, second);
    const listed = async (entityId: string) =>
      (await listThreadIds(ctx, { entityId })).map((thread) => thread.threadId);

    expect(await listed(String(ctx.agentId))).toEqual([first]);
    expect(await listed(otherAgent)).toEqual([second]);

    await ctx.api.aiThreadsRename({
      aiThreadsRenameRequest: { threadId: first, title: "Renamed first" },
    });
    await ctx.api.aiThreadsUpdateMessage({
      aiThreadsUpdateMessageRequest: {
        messageId: firstMessage,
        message: {
          role: "user",
          content: [{ type: "text", text: "edited in the first" }],
        },
      },
    });
    await ctx.api.aiThreadsClearMessages({ body: first });
    expect(
      await snapshotThread(ctx, second),
      "rename, edit and clear stayed in their agent",
    ).toEqual(secondBefore);

    await ctx.api.aiThreadsDelete({ body: first });
    expect(await listed(String(ctx.agentId))).toEqual([]);
    expect(await listed(otherAgent)).toEqual([second]);
    expect(
      await snapshotThread(ctx, second),
      "deleting a thread stayed in its agent",
    ).toEqual(secondBefore);
  });

  test("ThreadsApi - a 40-message history is read whole, edited, pruned from both ends and the middle, cleared, and starts over clean", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Forty");
    const markers = Array.from(
      { length: 40 },
      (_, index) => `marker-${String(index).padStart(2, "0")}`,
    );
    const ids: string[] = [];
    // One request at a time: the order of the history is what is being tested, and
    // concurrent writes do not promise one.
    for (const marker of markers)
      ids.push(await appendText(ctx, threadId, marker));

    expect(
      await readTexts(ctx, threadId),
      "all 40, in the order they were sent",
    ).toEqual(markers);
    expect((await readAll(ctx, threadId)).map((message) => message.id)).toEqual(
      ids,
    );

    await test.step("edit one in the middle", async () => {
      await ctx.api.aiThreadsUpdateMessage({
        aiThreadsUpdateMessageRequest: {
          messageId: ids[20],
          message: {
            role: "user",
            content: [{ type: "text", text: "marker-20 edited" }],
          },
        },
      });
      const expected = [...markers];
      expected[20] = "marker-20 edited";
      expect(await readTexts(ctx, threadId)).toEqual(expected);
    });

    await test.step("delete the first, a middle and the last", async () => {
      for (const index of [0, 19, 39]) {
        expect(
          (await ctx.api.aiThreadsDeleteMessage({ body: ids[index] })).status,
        ).toBe(200);
      }
      const expected = markers
        .map((marker, index) => (index === 20 ? "marker-20 edited" : marker))
        .filter((_, index) => ![0, 19, 39].includes(index));
      expect(await readTexts(ctx, threadId)).toEqual(expected);
      expect(
        (await ctx.api.aiThreadsGetMessageById({ messageId: ids[19] })).data,
        "a pruned message is not served",
      ).toBeNull();
    });

    await test.step("page the remainder back to front in sevens: every message once", async () => {
      const remaining = await readTexts(ctx, threadId);
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 8; page++) {
        const { data } = await ctx.api.aiThreadsReadMessages({
          threadId,
          count: 7,
          direction: "desc",
          cursor,
        });
        if (data.length === 0) break;
        seen.push(...data.map((message) => textOf(message)));
        const last = data[data.length - 1];
        cursor = JSON.stringify({ createdAt: last.createdAt, id: last.id });
      }
      expect(seen).toEqual([...remaining].reverse());
    });

    await test.step("clear, then a new message, and the old history stays gone", async () => {
      expect(
        (await ctx.api.aiThreadsClearMessages({ body: threadId })).status,
      ).toBe(200);
      expect(await readAll(ctx, threadId)).toEqual([]);
      await appendText(ctx, threadId, "a fresh start");
      expect(await readTexts(ctx, threadId)).toEqual(["a fresh start"]);
      const opened = await ctx.aiChat.openOrCreateThread("owner", {
        threadId,
        profileId: ctx.profileId,
        profile: ctx.profile,
        entityId: String(ctx.agentId),
      });
      expect(
        (opened.data?.priorMessages as Array<unknown>).length,
        "open-or-create replays only the new message",
      ).toBe(1);
    });
  });

  test("ThreadsApi - messages that carry attachments are stored, replayed, cleared and deleted with their thread, and a neighbour keeps its own", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // What happens to the attachment RECORD afterwards is not asserted: the
    // contract does not say, and today it stays readable by id after clear,
    // delete-message and thread deletion alike (see the report of this suite).
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const withAttachment = async (title: string) => {
      const threadId = await createThread(ctx, title);
      const attachmentId = await attachments.saveFileId(
        "owner",
        { title: `${title}.docx`, content: "payload", type: FileType.Document },
        String(ctx.agentId),
      );
      const { status, data } = await ctx.api.aiThreadsAppendUserMessage({
        aiThreadsAppendUserMessageRequest: {
          threadId,
          profileId: ctx.profileId,
          message: {
            role: "user",
            content: [{ type: "text", text: "with a file" }],
            attachments: [{ id: attachmentId }],
          },
        },
      });
      expect(status).toBe(200);
      return { threadId, attachmentId, messageId: appendedMessage(data).id };
    };

    const cleared = await withAttachment("Cleared");
    const deleted = await withAttachment("Deleted");
    const neighbour = await withAttachment("Neighbour");

    await test.step("the attachment is on the stored message and on its replay", async () => {
      const read = await readAll(ctx, cleared.threadId);
      expect(read[0].attachments).toEqual([{ id: cleared.attachmentId }]);
      const single = await ctx.api.aiThreadsGetMessageById({
        messageId: cleared.messageId,
      });
      expect(single.data.attachments).toEqual([{ id: cleared.attachmentId }]);
    });

    await test.step("clear-messages empties the thread of the message", async () => {
      expect(
        (await ctx.api.aiThreadsClearMessages({ body: cleared.threadId }))
          .status,
      ).toBe(200);
      expect(await readAll(ctx, cleared.threadId)).toEqual([]);
      expect(
        (
          await ctx.api.aiThreadsGetMessageById({
            messageId: cleared.messageId,
          })
        ).data,
      ).toBeNull();
    });

    await test.step("delete takes the thread and its attachment-bearing message", async () => {
      expect(
        (await ctx.api.aiThreadsDelete({ body: deleted.threadId })).status,
      ).toBe(200);
      expect(
        (await ctx.api.aiThreadsGetById({ threadId: deleted.threadId })).status,
      ).toBe(404);
      expect(
        (
          await ctx.api.aiThreadsGetMessageById({
            messageId: deleted.messageId,
          })
        ).data,
      ).toBeNull();
    });

    await test.step("the neighbouring thread still has its message with its attachment", async () => {
      const read = await readAll(ctx, neighbour.threadId);
      expect(read.map((message) => message.id)).toEqual([neighbour.messageId]);
      expect(read[0].attachments).toEqual([{ id: neighbour.attachmentId }]);
    });
  });

  test("ThreadsApi - reading while the thread is being deleted gives only whole answers, and the thread is gone afterwards", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Vanishing");
    for (const text of ["a", "b", "c"]) await appendText(ctx, threadId, text);

    const [reads, deleted] = await Promise.all([
      Promise.all(
        Array.from({ length: 4 }, () =>
          ctx.api.aiThreadsReadMessages({ threadId }),
        ),
      ),
      ctx.api.aiThreadsDelete({ body: threadId }),
    ]);

    expect(deleted.status).toBe(200);
    // A read that races the delete may land on either side of it. Both are
    // legitimate; a 500 or a half-empty list is not.
    for (const read of reads) {
      if (read.status === 200) {
        expect(read.data.map((message) => textOf(message))).toEqual([
          "a",
          "b",
          "c",
        ]);
      } else {
        expect(read.status).toBe(404);
      }
    }
    expect((await ctx.api.aiThreadsGetById({ threadId })).status).toBe(404);
    expect(await listThreadIds(ctx)).toEqual([]);
  });

  test("ThreadsApi - ids that were never issued reach nothing on any route", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // One sweep over every id-taking route with a well-formed id that never
    // existed, next to a live thread that must be left exactly as it was.
    const ctx = await threadsSetup(apiSdk, paymentsApi);
    const threadId = await createThread(ctx, "Bystander");
    await appendText(ctx, threadId, "still here");
    const before = await snapshotThread(ctx, threadId);
    const api = ctx.api;

    const outcomes: Record<string, number> = {
      "get-by-id": (await api.aiThreadsGetById({ threadId: UNKNOWN_ID }))
        .status,
      "read-messages": (
        await api.aiThreadsReadMessages({ threadId: UNKNOWN_ID })
      ).status,
      rename: (
        await api.aiThreadsRename({
          aiThreadsRenameRequest: { threadId: UNKNOWN_ID, title: "x" },
        })
      ).status,
      touch: (
        await api.aiThreadsTouch({
          aiThreadsTouchRequest: { threadId: UNKNOWN_ID },
        })
      ).status,
      "clear-messages": (await api.aiThreadsClearMessages({ body: UNKNOWN_ID }))
        .status,
      delete: (await api.aiThreadsDelete({ body: UNKNOWN_ID })).status,
      "append-user-message": (
        await api.aiThreadsAppendUserMessage({
          aiThreadsAppendUserMessageRequest: {
            threadId: UNKNOWN_ID,
            profileId: ctx.profileId,
            message: { role: "user", content: [{ type: "text", text: "x" }] },
          },
        })
      ).status,
      "open-or-create": (
        await api.aiThreadsOpenOrCreate({
          aiThreadsOpenOrCreateRequest: {
            threadId: UNKNOWN_ID,
            profileId: ctx.profileId,
            profile: sdkProfile(ctx),
            entityId: String(ctx.agentId),
            firstMessage: { role: "user", content: "x" },
          },
        })
      ).status,
      "regenerate-title": (
        await api.aiThreadsRegenerateTitle({
          aiThreadsRegenerateTitleRequest: {
            threadId: UNKNOWN_ID,
            profile: sdkProfile(ctx),
          },
        })
      ).status,
      "update-message": (
        await api.aiThreadsUpdateMessage({
          aiThreadsUpdateMessageRequest: {
            messageId: UNKNOWN_ID,
            message: { role: "user", content: [{ type: "text", text: "x" }] },
          },
        })
      ).status,
    };

    expect(await snapshotThread(ctx, threadId)).toEqual(before);
    expect((await listThreadIds(ctx)).map((thread) => thread.threadId)).toEqual(
      [threadId],
    );
    expect(outcomes).toEqual({
      "get-by-id": 404,
      "read-messages": 404,
      rename: 404,
      touch: 404,
      "clear-messages": 404,
      delete: 404,
      "append-user-message": 404,
      "open-or-create": 404,
      "regenerate-title": 404,
      "update-message": 404,
    });
  });
});
