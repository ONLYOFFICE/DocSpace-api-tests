import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  AiAgentChat,
  AgentRole,
  expectHealthyAssistantReply,
  inviteToAgent,
} from "@/src/helpers/ai-agent-chat";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { UserType } from "@/src/services/api-sdk";

// Chat moved off `/ai/rooms/{roomId}/chats` (404) onto threads:
//
//   POST   /ai/threads/create            { title, profileId, entityId }
//   POST   /ai/threads/open-or-create    { threadId?, profileId, firstMessage, entityId? }
//   GET    /ai/threads/list?entityId=[&count=][&cursor=][&query=]
//   GET    /ai/threads/get-by-id?threadId=
//   PUT    /ai/threads/rename            { threadId, title }
//   POST   /ai/threads/regenerate-title  { threadId, profile }
//   DELETE /ai/threads/delete            { threadId }
//   DELETE /ai/threads/clear-messages    { threadId }
//   POST   /ai/threads/touch             { threadId }
//   POST   /ai/threads/append-user-message
//   POST   /ai/ai/send-with-stream       -> assistant reply arrives async
//   GET    /ai/threads/read-messages?threadId=
//
// Gone with no replacement: per-room chat config (`/ai/rooms/{id}/chats/config`)
// and the model catalogue (`/ai/chats/models`, now `/ai/profiles/list`). Chat
// export is `/ai/text-to-docx`, covered in the messages suite. Tool-permission
// decisions moved to `/ai/ai/approve-tool-call` and belong with the tools suite.
//
// Two things every positive send test here has to do, because the API makes both
// easy to get wrong:
//
//   * A refused inference is still stored as an assistant message with empty
//     content and `status.reason === "error"`. Asserting that *an* assistant
//     message exists therefore passes on a portal where AI is entirely dead —
//     `expectHealthyAssistantReply` is the assertion that does not.
//   * The reply lands asynchronously and `waitForAssistantReply` returns on the
//     first one it sees, so a second turn must wait for reply number two
//     (`waitForAssistantReplies(..., 2)`), not just for "an assistant message".

// Membership alone is not enough: a member invited at Read is refused (403) on
// create and list, so every positive case here is invited at ContentCreator.
//
// Guest is absent for a reason rather than by oversight. An agent room grants a
// Guest nothing above Read — Editing/ContentCreator/RoomManager come back as
// "The role is not available for this user type" — and Read cannot use the
// agent, so a Guest can never chat with one. Both halves of that are pinned in
// chat.permission.spec.ts; there is no positive Guest case to write here.
const MEMBER_ROLES: Array<{ label: string; type: UserType; role: AgentRole }> =
  [
    { label: "DocSpaceAdmin", type: "DocSpaceAdmin", role: "docSpaceAdmin" },
    { label: "RoomAdmin", type: "RoomAdmin", role: "roomAdmin" },
    { label: "User", type: "User", role: "user" },
  ];

const SHORT_ANSWER_PROMPT =
  "You are a helpful test assistant. Keep answers very short.";

test.describe("POST /api/2.0/ai/threads/create - Start a chat", () => {
  test("POST /api/2.0/ai/threads/create - Owner starts a new thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });

    const { status, threadId } = await aiChat.createThread("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    expect(status).toBe(200);
    expect(threadId).toBeTruthy();

    const { status: readStatus, data } = await aiChat.getThread(
      "owner",
      threadId,
    );
    expect(readStatus).toBe(200);
    expect(data?.threadId).toBe(threadId);
    expect(data?.title).toBe("Autotest thread");
    expect(data?.profileId).toBe(profileId);

    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);
  });

  for (const { label, type, role } of MEMBER_ROLES) {
    test(`POST /api/2.0/ai/threads/create - ${label} invited to the agent starts a thread`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Chat Agent",
        profileId,
      });

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await inviteToAgent(ownerApi.rooms, agentId, memberData.response!.id!);

      const { status, threadId } = await aiChat.createThread(role, {
        title: "Member thread",
        profileId,
        agentId,
      });

      expect(status).toBe(200);
      expect(threadId).toBeTruthy();

      // The member can reach back into what they just created.
      const { status: readStatus, data } = await aiChat.getThread(
        role,
        threadId,
      );
      expect(readStatus).toBe(200);
      expect(data?.title).toBe("Member thread");

      const listed = await aiChat.listThreads(role, agentId);
      expect(listed.status).toBe(200);
      expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);
    });
  }
});

test.describe("POST /api/2.0/ai/ai/send-with-stream - Talk to an agent", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - Owner gets an assistant reply", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const question = "What is 2+2? Answer in one word.";
    const { status, streamError } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: question,
    });
    expect(streamError).toBeUndefined();
    expect(status).toBe(200);

    const messages = await aiChat.waitForAssistantReply("owner", threadId);

    // The question is stored verbatim...
    const asked = AiAgentChat.userMessages(messages);
    expect(asked).toHaveLength(1);
    expect(AiAgentChat.messageText(asked[0])).toBe(question);

    // ...and the model really answered it, rather than failing into the thread.
    expectHealthyAssistantReply(messages);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - Owner continues an existing thread with its context", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Two independent questions would pass on a backend that starts a fresh
    // conversation every turn, so the second question can only be answered from
    // the first one's context.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const first = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Remember the code word ORANGE. Reply with just: OK.",
    });
    expect(first.status).toBe(200);
    const afterFirst = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      1,
      120000,
    );
    expectHealthyAssistantReply(afterFirst);

    const { status } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message:
        "What code word did I ask you to remember? Reply with just that word.",
    });
    expect(status).toBe(200);

    const messages = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      2,
      120000,
    );

    expect(AiAgentChat.userMessages(messages)).toHaveLength(2);
    expectHealthyAssistantReply(messages, 2);

    const secondReply = AiAgentChat.assistantMessages(messages)[1];
    expect(AiAgentChat.messageText(secondReply).toUpperCase()).toContain(
      "ORANGE",
    );
  });

  for (const { label, type, role } of MEMBER_ROLES) {
    test(`POST /api/2.0/ai/ai/send-with-stream - ${label} invited to the agent gets a reply`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Chat Agent",
        profileId,
        prompt: SHORT_ANSWER_PROMPT,
      });

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await inviteToAgent(ownerApi.rooms, agentId, memberData.response!.id!);

      const threadId = await aiChat.createThreadId(role, {
        title: "Member thread",
        profileId,
        agentId,
      });

      const question = "What is 2+2? Answer in one word.";
      const { status, streamError } = await aiChat.sendMessage(role, {
        threadId,
        profileId,
        agentId,
        message: question,
      });
      expect(streamError).toBeUndefined();
      expect(status).toBe(200);

      const messages = await aiChat.waitForAssistantReply(role, threadId);

      const asked = AiAgentChat.userMessages(messages);
      expect(asked).toHaveLength(1);
      expect(AiAgentChat.messageText(asked[0])).toBe(question);
      expectHealthyAssistantReply(messages);
    });
  }
});

test.describe("Thread management", () => {
  test("GET /api/2.0/ai/threads/list - lists threads of one agent only", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const firstAgent = await aiChat.createAgentId("owner", {
      title: "Agent One",
      profileId,
    });
    const secondAgent = await aiChat.createAgentId("owner", {
      title: "Agent Two",
      profileId,
    });

    const firstThread = await aiChat.createThreadId("owner", {
      title: "Thread in agent one",
      profileId,
      agentId: firstAgent,
    });
    const secondThread = await aiChat.createThreadId("owner", {
      title: "Thread in agent two",
      profileId,
      agentId: secondAgent,
    });

    const { data, status } = await aiChat.listThreads("owner", firstAgent);
    const ids = data.map((thread) => thread.threadId);

    expect(status).toBe(200);
    expect(ids).toContain(firstThread);
    expect(ids).not.toContain(secondThread);
  });

  test("GET /api/2.0/ai/threads/list - returns nothing without an entityId", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The list is entity-scoped: an unfiltered call is not "all my threads".
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const { data, status } = await aiChat.listThreads("owner");

    // Positive control: the same thread is listed when the entity is named, so
    // the empty result is the scoping and not a thread that failed to appear.
    const scoped = await aiChat.listThreads("owner", agentId);
    expect(scoped.status).toBe(200);
    expect(scoped.data.map((thread) => thread.threadId)).toContain(threadId);

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  test("PUT /api/2.0/ai/threads/rename - Owner renames a thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Original title",
      profileId,
      agentId,
    });

    const { data, status } = await aiChat.renameThread(
      "owner",
      threadId,
      "Renamed thread",
    );

    const { data: after } = await aiChat.getThread("owner", threadId);

    expect(after?.title).toBe("Renamed thread");
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/ai/threads/delete - Owner deletes a thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });
    const survivor = await aiChat.createThreadId("owner", {
      title: "Thread that stays",
      profileId,
      agentId,
    });

    const { data, status } = await aiChat.deleteThread("owner", threadId);

    const list = await aiChat.listThreads("owner", agentId);
    const ids = list.data.map((thread) => thread.threadId);

    expect(list.status).toBe(200);
    expect(ids).not.toContain(threadId);
    // Positive control: the list is not empty because the read failed.
    expect(ids).toContain(survivor);
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("DELETE /api/2.0/ai/threads/clear-messages - Owner clears a thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "Something to clear",
    });
    const before = await aiChat.readMessages("owner", threadId);
    expect(before.status).toBe(200);
    expect(before.data.length).toBeGreaterThan(0);

    const { data, status } = await aiChat.clearThreadMessages(
      "owner",
      threadId,
    );

    const after = await aiChat.readMessages("owner", threadId);

    // The thread itself survives — only its messages are gone.
    expect(after.status).toBe(200);
    expect(after.data).toEqual([]);
    const { data: thread } = await aiChat.getThread("owner", threadId);
    expect(thread?.threadId).toBe(threadId);
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });

  test("POST /api/2.0/ai/threads/append-user-message - stores a message without an answer", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId,
      agentId,
    });

    const { status } = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "Just recording this",
    });

    const { data } = await aiChat.readMessages("owner", threadId);

    expect(status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].role).toBe("user");
    expect(AiAgentChat.messageText(data[0])).toBe("Just recording this");
  });

  test("POST /api/2.0/ai/threads/touch - bumps lastEditDate and moves the thread to the top", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `{success:true}` alone would also be returned by a no-op handler, so the
    // effect is what gets asserted: lastEditDate has second granularity, hence
    // the waits between the calls that have to land in different seconds.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });

    const older = await aiChat.createThreadId("owner", {
      title: "Older thread",
      profileId,
      agentId,
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const newer = await aiChat.createThreadId("owner", {
      title: "Newer thread",
      profileId,
      agentId,
    });

    const before = await aiChat.listThreads("owner", agentId);
    expect(before.status).toBe(200);
    expect(before.data.map((thread) => thread.threadId)).toEqual([
      newer,
      older,
    ]);
    const olderDateBefore = before.data.find(
      (thread) => thread.threadId === older,
    )!.lastEditDate!;
    const newerDateBefore = before.data.find(
      (thread) => thread.threadId === newer,
    )!.lastEditDate!;

    await new Promise((resolve) => setTimeout(resolve, 2000));
    const { data, status } = await aiChat.touchThread("owner", older);

    const after = await aiChat.listThreads("owner", agentId);
    expect(after.status).toBe(200);
    expect(after.data.map((thread) => thread.threadId)).toEqual([older, newer]);

    const olderDateAfter = after.data.find(
      (thread) => thread.threadId === older,
    )!.lastEditDate!;
    const newerDateAfter = after.data.find(
      (thread) => thread.threadId === newer,
    )!.lastEditDate!;

    expect(olderDateAfter).toBeGreaterThan(olderDateBefore);
    // Only the touched thread moves.
    expect(newerDateAfter).toBe(newerDateBefore);
    expect(data?.success).toBe(true);
    expect(status).toBe(200);
  });
});

test.describe("GET /api/2.0/ai/profiles/list - Model catalogue", () => {
  // Replaces the removed GET /ai/chats/models.
  test("GET /api/2.0/ai/profiles/list - Owner gets a catalogue that can back an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { status, data } = await aiChat.getProfiles("owner");

    expect(status).toBe(200);
    const profiles = data ?? [];
    expect(profiles.length).toBeGreaterThan(0);

    for (const profile of profiles) {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(profile.modelId).toBeTruthy();
      // Every profile is served by the ONLYOFFICE AI gateway; manual providers
      // are refused on these portals.
      expect(profile.providerType).toBe("onlyoffice");
      expect(typeof profile.canUseTool).toBe("boolean");
    }

    // "The endpoint returned something" is not the point — the catalogue has to
    // contain a text profile an agent can actually be created on. The catalogue
    // also ships image-only entries ("Nano Banana 2", gpt-5.4-image-2), so the
    // pick is by capability, not by position.
    const textProfile = AiAgentChat.pickTextProfile(profiles);
    expect(textProfile.canUseTool).toBe(true);
    expect(profiles.map((profile) => profile.id)).toContain(textProfile.id);

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Catalogue Agent",
      profileId: textProfile.id,
    });
    const { status: agentStatus, data: agent } = await aiChat.getAgentInfo(
      "owner",
      agentId,
    );
    expect(agentStatus).toBe(200);
    expect(agent?.response?.id).toBe(agentId);
  });
});

// The thread routes the chat suite does not already cover — sections 8.1 and 8.2.
//
//   POST /ai/threads/open-or-create   { threadId?, profile, profileId, firstMessage, entityId? }
//   GET  /ai/threads/list?entityId=[&count=][&cursor=][&query=]
//   POST /ai/threads/regenerate-title { threadId, profile }
//
// Thread creation, rename, delete, clear-messages and touch live in
// chat/chat.spec.ts; this file is the listing contract and the two routes the
// client uses that turned out to be broken.
//
// `open-or-create` is the route section 8.1 is written against: the client calls
// it with the first message instead of creating an empty thread. Only the "open an
// existing thread" half works — the "create from the first message" half answers
// 500 — so the atomicity, auto-title and concurrency cases of 8.1 have nothing to
// run against and are recorded as gaps.

test.describe("AI Threads - listing", () => {
  test("GET /api/2.0/ai/threads/list - threads come back newest-activity first", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profileId = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    ).id;

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId,
    });

    const alpha = await aiChat.createThreadId("owner", {
      title: "Alpha thread",
      profileId,
      agentId,
    });
    const beta = await aiChat.createThreadId("owner", {
      title: "Beta thread",
      profileId,
      agentId,
    });
    const gamma = await aiChat.createThreadId("owner", {
      title: "Gamma thread",
      profileId,
      agentId,
    });

    const { status, data } = await aiChat.listThreads("owner", agentId);
    expect(status).toBe(200);
    expect(data.map((thread) => thread.threadId)).toEqual([gamma, beta, alpha]);

    // Section 8.2: the payload has to carry enough for the sidebar — a title, the
    // selected profile and a timestamp to group by.
    for (const thread of data) {
      expect(thread.title, "thread title").toBeTruthy();
      expect(thread.profileId).toBe(profileId);
      expect(typeof thread.lastEditDate).toBe("number");
    }

    // `lastEditDate` is what the order is built from, and it decreases down the
    // list — the grouping section 8.2 wants ("today / yesterday / 7 days") is a
    // client-side reading of these timestamps.
    const dates = data.map((thread) => thread.lastEditDate!);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  test("GET /api/2.0/ai/threads/list - a deleted thread leaves the list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profileId = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    ).id;

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId,
    });
    const doomed = await aiChat.createThreadId("owner", {
      title: "Doomed thread",
      profileId,
      agentId,
    });
    const keeper = await aiChat.createThreadId("owner", {
      title: "Keeper thread",
      profileId,
      agentId,
    });

    expect((await aiChat.deleteThread("owner", doomed)).status).toBe(200);

    const { data } = await aiChat.listThreads("owner", agentId);
    expect(data.map((thread) => thread.threadId)).toEqual([keeper]);
  });

  test("BUG 82825: GET /api/2.0/ai/threads/list - count, cursor and query are accepted and ignored", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profileId = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    ).id;

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId,
    });
    for (const title of ["Alpha thread", "Beta thread", "Gamma thread"]) {
      await aiChat.createThreadId("owner", { title, profileId, agentId });
    }

    const all = await aiChat.listThreads("owner", agentId);
    expect(all.data).toHaveLength(3);

    // Paging: a count of 1 still returns everything, so a client cannot page and
    // a portal with thousands of threads has no way to ask for fewer.
    const paged = await aiChat.listThreads("owner", agentId, { count: 1 });
    expect(paged.status).toBe(200);
    expect(paged.data, "count=1 returns the whole list").toHaveLength(3);

    const cursored = await aiChat.listThreads("owner", agentId, {
      count: 2,
      cursor: "1",
    });
    expect(cursored.data).toHaveLength(3);

    // Search: a query that matches one title returns all three, and a query that
    // matches nothing returns all three as well — the filter is not applied, so
    // the sidebar search of 8.2 has to be done client-side.
    const matching = await aiChat.listThreads("owner", agentId, {
      query: "Alpha",
    });
    expect(matching.data).toHaveLength(3);

    const notMatching = await aiChat.listThreads("owner", agentId, {
      query: "nothing-matches-this",
    });
    expect(notMatching.status).toBe(200);

    test.fail();
    expect(
      notMatching.data,
      "a query matching no title must return no threads",
    ).toEqual([]);
  });
});

test.describe("AI Threads - open-or-create", () => {
  test("POST /api/2.0/ai/threads/open-or-create - opens an existing thread and replays its history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Existing thread",
      profileId: profile.id,
      agentId,
    });

    const { status, data } = await aiChat.openOrCreateThread("owner", {
      threadId,
      profileId: profile.id,
      profile,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });

    expect(status).toBe(200);
    expect(data?.threadId, "the existing thread is reused").toBe(threadId);
    expect(Array.isArray(data?.priorMessages)).toBe(true);
    expect(data?.priorMessages).toEqual([]);

    // Opening does not send the message: the thread is still empty afterwards,
    // and no second thread appeared.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data).toEqual([]);

    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.data.map((thread) => thread.threadId)).toEqual([threadId]);
  });

  test("POST /api/2.0/ai/threads/open-or-create - the profile id alone is enough to open a thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Existing thread",
      profileId: profile.id,
      agentId,
    });

    // The SDK types make the whole `AiProfile` object a required field, but the
    // open path binds on `profileId` alone. Worth pinning: it means the 500 in the
    // create case below is about the missing threadId, not about the body being
    // short of a profile.
    const { status, data } = await aiChat.openOrCreateThread("owner", {
      threadId,
      profileId: profile.id,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });

    expect(status).toBe(200);
    expect(data?.threadId).toBe(threadId);
    expect(data?.priorMessages).toEqual([]);

    // Opening still does not store the first message.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data).toEqual([]);
  });

  test("BUG 82826: POST /api/2.0/ai/threads/open-or-create - creating a thread from the first message returns 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId: profile.id,
    });

    // The same body that works for an existing thread, minus the threadId — the
    // "no thread yet, start one from this message" call of section 8.1.
    const { status, error } = await aiChat.openOrCreateThread("owner", {
      profileId: profile.id,
      profile,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "Reply with the single word OK." }],
      },
    });

    expect(error).toBe("Internal server error");

    // And it left nothing behind, so at least there is no orphan thread.
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.data, "no thread was created").toEqual([]);

    test.fail();
    expect(status, "creating a thread from the first message must work").toBe(
      200,
    );
  });
});

test.describe("AI Threads - regenerate-title", () => {
  test("BUG 82828: POST /api/2.0/ai/threads/regenerate-title - returns 500 on a thread with a real conversation", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const profile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.textVisionTools,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Title me",
      profileId: profile.id,
      agentId,
    });

    // A thread the model has actually answered, so the failure cannot be blamed on
    // there being nothing to build a title from.
    await aiChat.sendMessage("owner", {
      threadId,
      profileId: profile.id,
      agentId,
      message: "Explain gravity in one sentence.",
    });
    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expect(AiAgentChat.assistantMessages(messages).length).toBeGreaterThan(0);

    // Both shapes fail: the full profile object the SDK types ask for, and the
    // profileId a caller would try next.
    const withProfile = await aiChat.regenerateThreadTitle("owner", {
      threadId,
      profile,
    });
    expect(withProfile.error).toBe("Internal server error");

    const withProfileId = await aiChat.regenerateThreadTitle("owner", {
      threadId,
      profileId: profile.id,
      entityId: String(agentId),
    });
    expect(withProfileId.status).toBe(500);

    // The title is untouched, so nothing half-applied.
    const thread = await aiChat.getThread("owner", threadId);
    expect(thread.data?.title).toBe("Title me");

    test.fail();
    expect(withProfile.status, "regenerating a thread title must work").toBe(
      200,
    );
  });
});
