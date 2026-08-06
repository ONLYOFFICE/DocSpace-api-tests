import { expect } from "@playwright/test";
import { RoomType, FileShare, FolderType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import {
  AiAgentChat,
  AgentRole,
  AiProfile,
  expectHealthyAssistantReply,
  inviteToAgent,
} from "@/src/helpers/ai-agent-chat";
import { AiHttp } from "@/src/helpers/ai-http";
import { AiProfiles, AI_CAPS } from "@/src/helpers/ai-profiles";
import { AiTools } from "@/src/helpers/ai-tools";
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
    //
    // True as written because every thread on this portal belongs to an agent.
    // An unfiltered call is not empty in general — it answers with the bucket
    // that every non-agent entity shares, which is the subject of "every
    // non-agent entity shares one thread list" further down.
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
// Thread creation, rename, delete, clear-messages and touch are covered above;
// what follows is the listing contract and the two routes the client uses that
// turned out to be broken.
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

// ---------------------------------------------------------------------------
// Chatting from somewhere that is not an agent room.
//
// `entityId` on the thread and inference routes is a scope token, not an agent
// id: the client sends the id of whatever the user is looking at — an agent, an
// ordinary room, a folder — and the backend is meant to keep each of those
// scopes to itself and resolve the model per scope.
//
//   POST /ai/threads/create        { title, profileId, entityId }
//   GET  /ai/threads/list?entityId=
//   GET  /ai/assignments/get-all-assignments?entityId=
//
// What the portal actually does, measured on 2026-08-05, is split in two:
//
//   * An AGENT id is a real scope. Its threads are listed for it and for
//     nothing else.
//   * Every OTHER value — a room id, a folder id, a string that is not an id at
//     all, or no entityId — resolves to one single shared bucket. A thread
//     started while looking at room A is listed when looking at room B. That is
//     the bug the second test pins.
//
// Per-user isolation is unaffected and holds: the bucket is per user, so another
// member never sees these threads. That is asserted here too, because a test
// that only showed the leak would leave "does it cross users as well" open.

const CHAT_TITLE = "Autotest entity thread";

test.describe("AI Chat - room and folder entity context", () => {
  test("POST /api/2.0/ai/threads/create - a thread started in an ordinary room is listed for that room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Entity Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const { status, threadId } = await aiChat.createThread("owner", {
      title: CHAT_TITLE,
      profileId,
      agentId: roomId,
    });
    expect(status).toBe(200);
    expect(threadId).toBeTruthy();

    // Readable by id and listed under the room the user was looking at.
    const read = await aiChat.getThread("owner", threadId);
    expect(read.status).toBe(200);
    expect(read.data?.threadId).toBe(threadId);

    const listed = await aiChat.listThreads("owner", roomId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);

    // And it is a working thread, not just a record: a message in it is answered.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    const reply = AiAgentChat.assistantMessages(messages)[0];
    expect(reply, "the room-context thread got a reply").toBeDefined();
    expect(reply.status?.error).toBeUndefined();
    expect(AiAgentChat.messageText(reply).length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/ai/threads/create - a folder id is accepted as an entity", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const myDocsId = myFolder.response!.current!.id!;
    const { data: folder } = await ownerApi.folders.createFolder({
      folderId: myDocsId,
      createFolder: { title: "Autotest Entity Folder" },
    });
    const folderId = folder.response!.id!;

    const { status, threadId } = await aiChat.createThread("owner", {
      title: CHAT_TITLE,
      profileId,
      agentId: folderId,
    });
    expect(status).toBe(200);
    expect(threadId).toBeTruthy();

    const listed = await aiChat.listThreads("owner", folderId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);
  });

  test("BUG 82855: GET /api/2.0/ai/threads/list - every non-agent entity shares one thread list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Threads started in room A are listed while the user is in room B, in an
    // unrelated folder, and with no entity at all: the scope token is accepted
    // and then ignored for everything that is not an agent. An agent thread is
    // created alongside as the control — that one IS scoped, so this is a gap in
    // the room/folder context specifically, not "entityId does nothing".
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Entity Agent",
      profileId,
    });
    const { data: roomA } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Entity Room A",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomAId = roomA.response!.id!;
    const { data: roomB } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Entity Room B",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomBId = roomB.response!.id!;
    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const folderId = myFolder.response!.current!.id!;

    const inRoomA = await aiChat.createThreadId("owner", {
      title: "Autotest thread in room A",
      profileId,
      agentId: roomAId,
    });
    const inAgent = await aiChat.createThreadId("owner", {
      title: "Autotest thread in the agent",
      profileId,
      agentId,
    });

    // The control: the agent's scope holds its own thread and nothing else.
    const agentThreads = await aiChat.listThreads("owner", agentId);
    expect(agentThreads.status).toBe(200);
    expect(agentThreads.data.map((thread) => thread.threadId)).toEqual([
      inAgent,
    ]);

    const scopes: Array<[string, number | string | undefined]> = [
      ["room B", roomBId],
      ["My Documents", folderId],
      ["a string that is not an id", "autotest-not-an-entity"],
      ["no entity at all", undefined],
    ];

    const leaked: string[] = [];
    for (const [label, entityId] of scopes) {
      const listed = await aiChat.listThreads("owner", entityId);
      expect(listed.status, `listing threads for ${label}`).toBe(200);
      if (listed.data.some((thread) => thread.threadId === inRoomA)) {
        leaked.push(label);
      }
      // Whatever else is wrong, the agent's thread stays in the agent.
      expect(
        listed.data.map((thread) => thread.threadId),
        `the agent's thread must not be listed for ${label}`,
      ).not.toContain(inAgent);
    }

    test.fail();
    expect(
      leaked,
      "room A's thread is listed for these unrelated scopes",
    ).toEqual([]);
  });
});

// A location is not permanent. A room gets archived, comes back, or is deleted
// outright — and the conversations the user held in it have to end up somewhere
// defined. Archive is the bin for rooms (there is no Trash for them) and delete
// is irreversible, so these are the two shapes of "the place is gone".
test.describe("AI Chat - the room a thread was started in goes away", () => {
  test("GET /api/2.0/ai/threads/list, read-messages - a thread survives archiving its room and is still usable", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Archived Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread before archiving",
      profileId,
      agentId: roomId,
    });
    const stored = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "written before archiving",
    });
    expect(stored.status).toBe(200);

    await ownerApi.rooms.archiveRoom({
      id: roomId,
      archiveRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);
    expect(
      (await ownerApi.rooms.getRoomInfo({ id: roomId })).data.response
        ?.rootFolderType,
      "the room is in Archive",
    ).toBe(FolderType.Archive);

    // An archived room is read-only for its content, but a chat is not its
    // content: the conversation is still listed, readable and answerable.
    const listed = await aiChat.listThreads("owner", roomId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);

    const read = await aiChat.readMessages("owner", threadId);
    expect(read.status).toBe(200);
    expect(
      AiAgentChat.userMessages(read.data).map(AiAgentChat.messageText),
    ).toEqual(["written before archiving"]);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    // And bringing the room back does not disturb any of it.
    const unarchived = await ownerApi.rooms.unarchiveRoom({ id: roomId });
    expect(unarchived.status).toBe(200);
    await waitForOperation(ownerApi.operations);

    const afterUnarchive = await aiChat.listThreads("owner", roomId);
    expect(afterUnarchive.status).toBe(200);
    expect(afterUnarchive.data.map((thread) => thread.threadId)).toContain(
      threadId,
    );
    expect((await aiChat.readMessages("owner", threadId)).data.length).toBe(
      read.data.length + 2,
    );
  });

  test("GET /api/2.0/ai/threads/get-by-id, read-messages - deleting the room does not delete the conversations held in it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Doomed Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread in a doomed room",
      profileId,
      agentId: roomId,
    });
    const stored = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "written before the room was deleted",
    });
    expect(stored.status).toBe(200);

    await ownerApi.rooms.deleteRoom({
      id: roomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);
    expect(
      (await ownerApi.rooms.getRoomInfo({ id: roomId })).status,
      "deleting a room is permanent",
    ).toBe(404);

    // The room is gone for good; what the user wrote is theirs and stays. This
    // is the only defensible half — whether a thread whose location no longer
    // exists should still be *listed* under that id is the shared-bucket
    // question (BUG 82855), not this one.
    const info = await aiChat.getThread("owner", threadId);
    expect(info.status).toBe(200);
    expect(info.data?.threadId).toBe(threadId);

    const read = await aiChat.readMessages("owner", threadId);
    expect(read.status).toBe(200);
    expect(
      AiAgentChat.userMessages(read.data).map(AiAgentChat.messageText),
    ).toEqual(["written before the room was deleted"]);

    const deleted = await aiChat.deleteThread("owner", threadId);
    expect(deleted.status, "and it can still be cleaned up").toBe(200);
    expect((await aiChat.getThread("owner", threadId)).data).toBeNull();
  });
});

test.describe("AI Chat - room context across users", () => {
  test("GET /api/2.0/ai/threads/list, read-messages - a room member does not see the Owner's room thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Shared Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const member = await apiSdk.addMember("owner", "RoomAdmin");
    const memberId = member.data.response!.id!;
    const invited = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });
    expect(invited.status, "inviting the member into the room").toBe(200);

    const ownerThread = await aiChat.createThreadId("owner", {
      title: "Autotest owner room thread",
      profileId,
      agentId: roomId,
    });

    // Everything owner-side is done; from here the shared request context acts
    // as the member.
    await apiSdk.authenticateMember(member.userData, "RoomAdmin");
    await aiChat.expectActingAs("roomAdmin", memberId, "the invited member");

    // Sharing the room does not share what the Owner asked the AI in it.
    const listed = await aiChat.listThreads("roomAdmin", roomId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).not.toContain(
      ownerThread,
    );

    const read = await aiChat.readMessages("roomAdmin", ownerThread);
    expect(read.status).toBe(403);

    const info = await aiChat.getThread("roomAdmin", ownerThread);
    expect(info.status).toBe(403);

    // The member's own room thread lands in their own list — the positive
    // control that proves the empty list above is isolation, not a broken read.
    const memberThread = await aiChat.createThreadId("roomAdmin", {
      title: "Autotest member room thread",
      profileId,
      agentId: roomId,
    });
    const memberList = await aiChat.listThreads("roomAdmin", roomId);
    expect(memberList.status).toBe(200);
    expect(memberList.data.map((thread) => thread.threadId)).toEqual([
      memberThread,
    ]);
  });

  test("BUG 82858: GET /api/2.0/ai/threads/list - listing the threads of a room the user cannot see returns 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Private Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const outsider = await apiSdk.addMember("owner", "User");
    const outsiderId = outsider.data.response!.id!;
    await apiSdk.authenticateMember(outsider.userData, "User");
    await aiChat.expectActingAs("user", outsiderId, "the non-member");

    // An id that is not an entity at all is answered normally, so the failure
    // below is the access check on a real room, not a parsing problem.
    const nonsense = await aiChat.listThreads("user", "autotest-not-an-entity");
    expect(nonsense.status, "listing threads for a made-up entity").toBe(200);

    const listed = await aiChat.listThreads("user", roomId);

    // A room the caller cannot open should be refused, the way read-messages
    // refuses another user's thread — instead the request crashes.
    test.fail();
    expect(listed.status).toBe(403);
  });
});

// The model a NEW conversation starts on, per entity. Which model one existing
// conversation runs on is a property of the thread and is covered by "the model
// of one thread" below — this block is only about the entity-level binding
// underneath it.
test.describe("AI Chat - the default model of a room", () => {
  // An agent gets its own Chat binding when it is created (assignments.spec.ts);
  // a room never can. `assign` takes only `{actionType, profileId}` — there is no
  // entity-scoped write — and an `entityId` sent alongside is not rejected, it is
  // dropped, so the binding lands portal-wide while the room read (which falls
  // back to portal-wide, BUG 82832) makes it look scoped. A room therefore has no
  // default of its own: new conversations in it start on the portal-wide binding.
  test("PUT /api/2.0/ai/assignments/assign - an entityId on the write is ignored and the binding lands portal-wide", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    const portalWide = await profiles.getAllAssignments("owner");
    expect(portalWide.status).toBe(200);
    const portalDefault = portalWide.data!.Default;

    // A text profile that is NOT the portal default, so "the room uses its own"
    // cannot be confused with "the room fell back to the portal's".
    const other = catalogue.find(
      (profile) =>
        profile.id !== portalDefault &&
        profile.canUseTool === true &&
        !!profile.modelId,
    );
    expect(
      other,
      "a second usable text profile in the catalogue",
    ).toBeDefined();

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    // Nothing is bound to Chat yet, so whatever Chat reads back afterwards was
    // written by this call and by nothing else.
    expect(portalWide.data?.Chat).toBeUndefined();

    const assigned = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: other!.id,
      entityId: String(roomId),
    });
    expect(assigned.status).toBe(200);
    expect(assigned.data?.success).toBe(true);

    // The room appears to have its own binding…
    const roomAssignments = await profiles.getAllAssignments(
      "owner",
      String(roomId),
    );
    expect(roomAssignments.status).toBe(200);
    expect(roomAssignments.data?.Chat).toBe(other!.id);

    // …but it is the same one every other scope now has, including an unrelated
    // room and the portal itself.
    const { data: otherRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Unrelated Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const unrelated = await profiles.getAllAssignments(
      "owner",
      String(otherRoom.response!.id!),
    );
    expect(unrelated.data?.Chat).toBe(other!.id);

    const afterPortal = await profiles.getAllAssignments("owner");
    expect(afterPortal.status).toBe(200);
    expect(afterPortal.data?.Chat).toBe(other!.id);
    expect(afterPortal.data?.Default).toBe(portalDefault);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a room chat with no profileId is answered through the portal-wide binding", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    // The room has no binding of its own to fall back to — resolution can only
    // come from the portal-wide Default.
    const resolved = await profiles.resolveForAction("owner", "Chat", roomId);
    expect(resolved.status).toBe(200);
    expect(resolved.data?.profileId).toBeTruthy();

    const threadId = await aiChat.createThreadId("owner", {
      title: CHAT_TITLE,
      profileId,
      agentId: roomId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    const reply = AiAgentChat.assistantMessages(messages)[0];
    expect(reply, "a send without profileId was answered").toBeDefined();
    expect(reply.status?.error).toBeUndefined();
    expect(AiAgentChat.messageText(reply).length).toBeGreaterThan(0);
  });

  test("BUG XXXXX: GET /api/2.0/ai/assignments - the scope of a room the caller cannot open returns 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Third route in the same family: naming a room the caller has no access to
    // crashes the access check instead of refusing it — `get-deep-mode` does it
    // as BUG 82816, `threads/list` as BUG 82858, and this is /ai/assignments.
    // A member of the room is answered normally (portal-wide fallback), so the
    // 500 really is the access check and not a broken scope parameter.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [, other] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Private Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    // The owner binds Chat to a profile that is not the portal default, so a
    // room-specific answer would be distinguishable if there were one.
    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: other.id,
    });
    expect(bound.data?.success).toBe(true);

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await aiChat.expectActingAs(
      "user",
      memberData.response!.id!,
      "the non-member",
    );

    const scoped = await profiles.getAllAssignments("user", roomId);

    // Control: without the room scope the same caller is answered, so the
    // failure is about the room and not about this role or a dead route.
    const own = await profiles.getAllAssignments("user");
    expect(own.status, "the caller's own portal-wide read").toBe(200);

    test.fail();
    expect(scoped.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Picking the model for one conversation.
//
// The model is a property of the THREAD, not of the entity: two threads side by
// side in the same agent or room can run on different models, and reopening one
// has to bring its own model back.
//
//   POST /ai/threads/create      { title, profileId, entityId }
//   GET  /ai/threads/get-by-id?threadId=      -> profileId
//   GET  /ai/threads/list?entityId=           -> profileId per thread
//   POST /ai/ai/send-with-stream { threadId, profileId?, … }
//
// How the picker reaches the backend, measured 2026-08-05: there is no route
// that sets a thread's model. `threads/update` and `threads/set-profile` are
// 404, `rename` accepts a `profileId` and ignores it. The only thing that moves
// it is `profileId` on the next send — which the SDK calls a "session-level
// profile override for this request only" and which in fact rewrites what the
// thread is stored with. The behaviour is what the feature needs; the SDK's
// description of it is wrong.
//
// The dangerous corollary is the third test: a send that omits `profileId`
// does not fall back to the thread's own model, it overwrites it with the
// entity's.

/** Two different usable text profiles, deterministically ordered. */
function twoTextProfiles(profiles: AiProfile[]): [AiProfile, AiProfile] {
  const usable = profiles
    .filter(
      (profile) =>
        profile.canUseTool === true &&
        !!profile.modelId &&
        !AiAgentChat.NON_TEXT_MODEL_MARKERS.some((marker) =>
          profile.modelId.toLowerCase().includes(marker),
        ),
    )
    .sort((a, b) => a.modelId.localeCompare(b.modelId));

  expect(
    usable.length,
    "the catalogue has at least two usable text profiles",
  ).toBeGreaterThan(1);
  return [usable[0], usable[1]];
}

class ThreadRoutes extends AiHttp {
  put(role: AgentRole, path: string, body: unknown) {
    return this.call<unknown>(role, "put", path, body);
  }

  /** Raw create — the helper always fills `profileId` in, this one does not. */
  post(role: AgentRole, path: string, body: unknown) {
    return this.call<{ threadId?: string }>(role, "post", path, body);
  }
}

test.describe("AI Chat - the model of one thread", () => {
  test("POST /api/2.0/ai/threads/create - two threads of the same entity keep different models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    // The agent is built on `first`, so `second` is a real per-thread choice
    // rather than a copy of the entity's model.
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Model Agent",
      profileId: first.id,
    });

    const threadA = await aiChat.createThreadId("owner", {
      title: "Autotest thread on the first model",
      profileId: first.id,
      agentId,
    });
    const threadB = await aiChat.createThreadId("owner", {
      title: "Autotest thread on the second model",
      profileId: second.id,
      agentId,
    });

    // Reopening each one brings back its own model.
    const readA = await aiChat.getThread("owner", threadA);
    const readB = await aiChat.getThread("owner", threadB);
    expect(readA.status).toBe(200);
    expect(readB.status).toBe(200);
    expect(readA.data?.profileId).toBe(first.id);
    expect(readB.data?.profileId).toBe(second.id);

    // And the list the UI draws the picker from carries it per thread.
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    const byId = new Map(
      listed.data.map((thread) => [thread.threadId, thread.profileId]),
    );
    expect(byId.get(threadA)).toBe(first.id);
    expect(byId.get(threadB)).toBe(second.id);

    // Talking in one does not touch the other's model.
    const sent = await aiChat.sendMessage("owner", {
      threadId: threadB,
      profileId: second.id,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    await aiChat.waitForAssistantReply("owner", threadB);

    expect((await aiChat.getThread("owner", threadB)).data?.profileId).toBe(
      second.id,
    );
    expect((await aiChat.getThread("owner", threadA)).data?.profileId).toBe(
      first.id,
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - the profile sent with a message becomes the thread's model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Switching model mid-conversation: the picker has no route of its own, so
    // the new choice rides along with the next message — and sticks.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Model Agent",
      profileId: first.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest switching thread",
      profileId: first.id,
      agentId,
    });
    expect((await aiChat.getThread("owner", threadId)).data?.profileId).toBe(
      first.id,
    );

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: second.id,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    await aiChat.waitForAssistantReply("owner", threadId);

    // Reopening the conversation shows the model it was last answered with,
    // both by id and in the list.
    const reopened = await aiChat.getThread("owner", threadId);
    expect(reopened.data?.profileId).toBe(second.id);
    const listed = await aiChat.listThreads("owner", agentId);
    expect(
      listed.data.find((thread) => thread.threadId === threadId)?.profileId,
    ).toBe(second.id);

    // The switch was per thread: the agent it lives in still resolves to the
    // model it was built on, so a new conversation there starts on `first`.
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const agentBinding = await profiles.getAllAssignments("owner", agentId);
    expect(agentBinding.status).toBe(200);
    expect(agentBinding.data?.Chat).toBe(first.id);

    const sibling = await aiChat.createThreadId("owner", {
      title: "Autotest sibling thread",
      profileId: first.id,
      agentId,
    });
    expect((await aiChat.getThread("owner", sibling)).data?.profileId).toBe(
      first.id,
    );
  });

  test("BUG 82860: POST /api/2.0/ai/ai/send-with-stream - a message with no profileId replaces the thread's chosen model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // A client that lets the user pick a model once and then sends plain
    // messages loses the choice on the first of them: with no `profileId` in the
    // body the backend resolves the entity's model and writes THAT onto the
    // thread, instead of using the one the thread already carries.
    //
    // Both contexts are checked because they lose it to different models: in an
    // agent the thread is reset to the agent's profile, in a room to the
    // portal-wide Default.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Model Agent",
      profileId: first.id,
    });
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const kept: Record<string, string | undefined> = {};
    for (const [label, entityId] of [
      ["in an agent", agentId],
      ["in a room", roomId],
    ] as Array<[string, number]>) {
      const threadId = await aiChat.createThreadId("owner", {
        title: `Autotest thread ${label}`,
        profileId: second.id,
        agentId: entityId,
      });
      expect(
        (await aiChat.getThread("owner", threadId)).data?.profileId,
        `the thread ${label} starts on the chosen model`,
      ).toBe(second.id);

      const sent = await aiChat.sendMessage("owner", {
        threadId,
        agentId: entityId,
        message: "Reply with the single word OK.",
      });
      expect(sent.status, label).toBe(200);
      expect(sent.streamError, label).toBeUndefined();
      await aiChat.waitForAssistantReply("owner", threadId);

      kept[label] = (await aiChat.getThread("owner", threadId)).data?.profileId;
    }

    test.fail();
    expect(kept, "the thread keeps the model it was created with").toEqual({
      "in an agent": second.id,
      "in a room": second.id,
    });
  });

  test("PUT /api/2.0/ai/threads/* - no route changes a thread's model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Worth pinning because it is why the switch has to ride on a message: a
    // client looking for a "set the model of this thread" call finds candidates
    // that either do not exist or accept the field and drop it.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const routes = new ThreadRoutes(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Model Agent",
      profileId: first.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread",
      profileId: first.id,
      agentId,
    });

    const missing = [
      "/api/2.0/ai/threads/update",
      "/api/2.0/ai/threads/set-profile",
    ];
    for (const path of missing) {
      const { status } = await routes.put("owner", path, {
        threadId,
        profileId: second.id,
      });
      expect(status, `PUT ${path}`).toBe(404);
    }

    // rename does exist, takes the field without complaint, and ignores it.
    const renamed = await routes.put("owner", "/api/2.0/ai/threads/rename", {
      threadId,
      title: "Autotest thread",
      profileId: second.id,
    });
    expect(renamed.status).toBe(200);

    const after = await aiChat.getThread("owner", threadId);
    expect(after.data?.profileId).toBe(first.id);
  });

  test("POST /api/2.0/ai/threads/create - a thread started without a profileId has no model at all", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // "A new conversation starts on the model of the place it was started in"
    // has no create-time half: the field is optional, and leaving it out does
    // not make the backend resolve anything — the thread simply has no model
    // until a message brings one. Together with BUG 82860 (a message without a
    // profileId wipes the thread's model) that makes the client the only thing
    // holding the choice.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const routes = new ThreadRoutes(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    // The portal-wide binding is set to a real profile, so "no model" below
    // cannot be "there was nothing to resolve to".
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const assigned = await profiles.assign("owner", {
      actionType: "Chat",
      profileId,
    });
    expect(assigned.data?.success).toBe(true);

    const created = await routes.post("owner", "/api/2.0/ai/threads/create", {
      title: "Autotest thread with no model",
      entityId: String(roomId),
    });
    expect(created.status).toBe(200);
    const threadId = created.data?.threadId ?? "";
    expect(threadId).toBeTruthy();

    const read = await aiChat.getThread("owner", threadId);
    expect(read.status).toBe(200);
    expect(
      read.data?.profileId,
      "the thread carries no model of its own",
    ).toBeUndefined();

    const listed = await aiChat.listThreads("owner", roomId);
    expect(
      listed.data.find((thread) => thread.threadId === threadId)?.profileId,
      "and the list the picker is drawn from carries none either",
    ).toBeUndefined();

    // Control: the field is not simply missing from the DTO — a message with a
    // profile fills it in, on this very thread.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    await aiChat.waitForAssistantReply("owner", threadId);

    expect((await aiChat.getThread("owner", threadId)).data?.profileId).toBe(
      profileId,
    );
  });

  test("PUT /api/2.0/ai/assignments/assign - rebinding Chat does not move an existing thread onto the new model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The portal-wide binding is the only model setting an ordinary location
    // has (`assign` drops an entityId, BUG 82832 / "the default model of a
    // room"), so this is the one "the entity's setting changed" case that can
    // be staged. It must not reach back into conversations already under way.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: first.id,
    });
    expect(bound.data?.success).toBe(true);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread on the first model",
      profileId: first.id,
      agentId: roomId,
    });
    expect((await aiChat.getThread("owner", threadId)).data?.profileId).toBe(
      first.id,
    );

    const rebound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: second.id,
    });
    expect(rebound.data?.success).toBe(true);
    expect(
      (await profiles.getAllAssignments("owner")).data?.Chat,
      "the binding really changed",
    ).toBe(second.id);

    // The conversation keeps the model it was started on.
    expect((await aiChat.getThread("owner", threadId)).data?.profileId).toBe(
      first.id,
    );
    const listed = await aiChat.listThreads("owner", roomId);
    expect(
      listed.data.find((thread) => thread.threadId === threadId)?.profileId,
    ).toBe(first.id);
  });

  test("POST /api/2.0/ai/threads/create - the chosen profile is validated", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Model Agent",
      profileId,
    });

    const cases: Array<[string, string, number]> = [
      [
        "a well-formed id of no profile",
        "019ed118-0000-0000-0000-0000000000ff",
        404,
      ],
      ["an id that is not a GUID", "autotest-not-a-profile", 400],
      ["an empty id", "", 400],
    ];

    for (const [label, badProfileId, expected] of cases) {
      const created = await aiChat.createThread("owner", {
        title: `Autotest ${label}`,
        profileId: badProfileId,
        agentId,
      });
      expect(created.status, label).toBe(expected);
      expect(created.threadId, `${label} created no thread`).toBe("");
    }

    // None of the refusals left a thread behind.
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Generating an image from a chat.
//
// There is no image route: `/ai/ai/generate-image`, `/ai/images/generate` and
// `/ai/ai/image` are all 404. The feature is a tool — a text model asked for a
// picture answers with a `generate_image` tool call, which the engine runs
// itself (it is not in list-system-tools, and no client offers it). The
// ImageGeneration binding in /ai/assignments is what says which profile draws it.
//
// Neither half works on this build:
//
//   * The tool call never resolves. The stream stays open — measured past two
//     minutes — and the thread is left holding an assistant message whose
//     `generate_image` call has no result and no error, so a client cannot even
//     tell the user it failed.
//   * The image profile itself cannot be driven directly either: pointing a
//     thread at it answers `model_not_found`, "400 model is not a chat model".
//
// The first test caps the request on the client side. What it asserts is
// therefore what the *thread* holds afterwards, which is the durable evidence;
// the frames that were in flight when the cap hit are gone.

/** Long enough to be sure this is a hang, short enough not to stall the suite. */
const STREAM_CAP_MS = 45000;

test.describe("AI Chat - image generation", () => {
  test("BUG 82861: POST /api/2.0/ai/ai/send-with-stream - a request for an image hangs on an unresolved generate_image call", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Image Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest image thread",
      profileId,
      agentId,
    });

    let finished = false;
    try {
      await aiChat.sendMessage("owner", {
        threadId,
        profileId,
        agentId,
        message: "Generate an image of a red circle on a white background.",
        timeoutMs: STREAM_CAP_MS,
      });
      finished = true;
    } catch {
      // The stream did not terminate within the cap; the thread is read below.
    }

    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.status).toBe(200);
    const reply = AiAgentChat.assistantMessages(messages.data)[0];
    expect(reply, "the half-written reply is stored").toBeDefined();

    // The model asked for the built-in drawing tool…
    const calls = AiAgentChat.toolCalls(reply);
    expect(calls.map((call) => call.toolName)).toContain("generate_image");

    // …which is the engine's own: no client offered it and it is not in the
    // catalogue the tools API publishes.
    const system = await aiTools.listSystemTools("owner");
    expect(
      (system.data?.docspace ?? []).map((tool) => tool.name),
      "generate_image is server-side, not an advertised DocSpace tool",
    ).not.toContain("generate_image");

    // Nothing ever came back for it, and the message carries no failure either —
    // it is simply abandoned mid-reply.
    const drawing = calls.find((call) => call.toolName === "generate_image")!;
    expect(drawing.result).toBeUndefined();
    expect(reply.status).toBeUndefined();

    test.fail();
    expect(finished, `the stream ended within ${STREAM_CAP_MS} ms`).toBe(true);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - an image profile cannot be used as a chat model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The other way round: driving the image profile directly. The send is
    // accepted and the refusal arrives as a stored `message-incomplete`, which
    // is the shape a client has to look for — the HTTP status is 200 throughout.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const imageProfile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.imageOnly,
    );
    const textProfileId = await aiChat.defaultProfileId("owner");

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Image Profile Agent",
      profileId: textProfileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest image profile thread",
      profileId: imageProfile.id,
      agentId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: imageProfile.id,
      agentId,
      message: "Draw a red circle.",
    });

    expect(sent.status).toBe(200);
    expect(AiAgentChat.frameTypes(sent.text)).toContain("message-incomplete");

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    const reply = AiAgentChat.assistantMessages(messages)[0];
    expect(reply).toBeDefined();
    expect(reply.status?.type).toBe("incomplete");
    expect(reply.status?.reason).toBe("error");
    expect(reply.status?.error?.code).toBe("model_not_found");
    expect(AiAgentChat.messageText(reply)).toBe("");

    // The user's question is still in the thread — the failure costs the reply,
    // not the conversation.
    expect(AiAgentChat.userMessages(messages)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Changing a thread while the model is still writing into it.
//
// This block only became reachable once it was established that hanging up on
// `send-with-stream` does NOT stop the generation (see the stop block in
// messages.spec.ts): the backend keeps writing for roughly twenty seconds after
// the client is gone. That gives an API test a window in which the thread is
// genuinely being written to by someone else, which is exactly the race a user
// creates by renaming, clearing or deleting a chat mid-reply.
//
// The window is opened with `sendAndAbort` — the send hands back control at the
// cap while the reply is still on its way — and the mutation is issued straight
// afterwards. Each test then waits the whole generation out before looking, so
// what it asserts is the settled state rather than a snapshot mid-flight.

/** Comfortably longer than the ~25 s a full reply needs after the disconnect. */
const GENERATION_WINDOW_MS = 60000;

/** Long enough that the reply is certainly still being written at the cut. */
const RACE_PROMPT =
  "Write a detailed essay of at least 600 words about the history of typography. " +
  "Number every paragraph.";

const RACE_CUT_MS = 5000;

async function settleGeneration(ms = GENERATION_WINDOW_MS) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test.describe("AI Threads - mutated while the model is still writing", () => {
  test("PUT /api/2.0/ai/threads/rename - a rename mid-reply survives the reply", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Race Rename Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest before rename",
      profileId,
      agentId,
    });

    const { aborted } = await aiChat.sendAndAbort("owner", {
      threadId,
      profileId,
      agentId,
      message: RACE_PROMPT,
      afterMs: RACE_CUT_MS,
    });
    expect(aborted, "the reply was still being written").toBe(true);

    const renamed = await aiChat.renameThread(
      "owner",
      threadId,
      "Autotest renamed mid-reply",
    );
    expect(renamed.status).toBe(200);

    // The reply lands after the rename; neither write loses to the other.
    const settled = await aiChat.waitForStableAssistantText("owner", threadId);
    expect(settled.text.length, "the reply still arrived").toBeGreaterThan(0);

    const thread = await aiChat.getThread("owner", threadId);
    expect(thread.status).toBe(200);
    expect(thread.data?.title).toBe("Autotest renamed mid-reply");

    const listed = await aiChat.listThreads("owner", agentId);
    expect(
      listed.data.find((entry) => entry.threadId === threadId)?.title,
    ).toBe("Autotest renamed mid-reply");
  });

  test("DELETE /api/2.0/ai/threads/delete - a thread deleted mid-reply does not come back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The failure this rules out: the in-flight reply is written after the
    // delete and recreates the row, leaving a chat the user thought was gone.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Race Delete Agent",
      profileId,
    });
    const doomed = await aiChat.createThreadId("owner", {
      title: "Autotest deleted mid-reply",
      profileId,
      agentId,
    });
    // A second thread as the control: whatever happens to the deleted one, the
    // list has to still work and still hold this.
    const keeper = await aiChat.createThreadId("owner", {
      title: "Autotest keeper",
      profileId,
      agentId,
    });

    const { aborted } = await aiChat.sendAndAbort("owner", {
      threadId: doomed,
      profileId,
      agentId,
      message: RACE_PROMPT,
      afterMs: RACE_CUT_MS,
    });
    expect(aborted).toBe(true);

    expect((await aiChat.deleteThread("owner", doomed)).status).toBe(200);
    await settleGeneration();

    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(
      listed.data.map((entry) => entry.threadId),
      "the deleted thread must not be resurrected by the late reply",
    ).toEqual([keeper]);

    const messages = await aiChat.readMessages("owner", doomed);
    expect(messages.data, "and it holds no messages either").toEqual([]);
  });

  test("DELETE /api/2.0/ai/threads/clear-messages - clearing mid-reply does not bring the question back", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Race Clear Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest cleared mid-reply",
      profileId,
      agentId,
    });

    const { aborted } = await aiChat.sendAndAbort("owner", {
      threadId,
      profileId,
      agentId,
      message: RACE_PROMPT,
      afterMs: RACE_CUT_MS,
    });
    expect(aborted).toBe(true);

    expect((await aiChat.clearThreadMessages("owner", threadId)).status).toBe(
      200,
    );
    await settleGeneration();

    // Whether the late reply is dropped or lands in the emptied thread is the
    // backend's choice; what must not happen is the cleared *question* coming
    // back, because that is history the user asked to be gone.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.status).toBe(200);
    expect(
      AiAgentChat.userMessages(messages.data),
      "the cleared question must stay cleared",
    ).toEqual([]);

    // The thread itself survives clearing, with its title.
    const thread = await aiChat.getThread("owner", threadId);
    expect(thread.status).toBe(200);
    expect(thread.data?.title).toBe("Autotest cleared mid-reply");
  });

  test("POST /api/2.0/ai/ai/send-with-stream - two threads of one agent generate at the same time", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Concurrency inside a single entity: two replies in flight for the same
    // user and agent must not be serialised into one another's thread.
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Concurrent Agent",
      profileId,
    });
    const first = await aiChat.createThreadId("owner", {
      title: "Autotest concurrent A",
      profileId,
      agentId,
    });
    const second = await aiChat.createThreadId("owner", {
      title: "Autotest concurrent B",
      profileId,
      agentId,
    });

    const [sentA, sentB] = await Promise.all([
      aiChat.sendMessage("owner", {
        threadId: first,
        profileId,
        agentId,
        message: "Reply with the single word ALPHA and nothing else.",
      }),
      aiChat.sendMessage("owner", {
        threadId: second,
        profileId,
        agentId,
        message: "Reply with the single word BETA and nothing else.",
      }),
    ]);
    expect(sentA.status).toBe(200);
    expect(sentA.streamError).toBeUndefined();
    expect(sentB.status).toBe(200);
    expect(sentB.streamError).toBeUndefined();

    const messagesA = await aiChat.waitForAssistantReply("owner", first);
    const messagesB = await aiChat.waitForAssistantReply("owner", second);
    expectHealthyAssistantReply(messagesA);
    expectHealthyAssistantReply(messagesB);

    // Each answer went to its own thread — the give-away for a crossed stream
    // is the other thread's word.
    expect(AiAgentChat.assistantText(messagesA)).toContain("ALPHA");
    expect(AiAgentChat.assistantText(messagesA)).not.toContain("BETA");
    expect(AiAgentChat.assistantText(messagesB)).toContain("BETA");
    expect(AiAgentChat.assistantText(messagesB)).not.toContain("ALPHA");

    // And each holds exactly its own question.
    expect(AiAgentChat.userMessages(messagesA)).toHaveLength(1);
    expect(AiAgentChat.userMessages(messagesB)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// State changed from outside the conversation.
//
// The client keeps a local copy of the threads, the profiles and the current
// chat, and re-reads them when something says they are stale
// (`updateThreads`, `updateProfiles`, `updateModelAssignment`, …). What the
// backend owes it is that a plain re-read after somebody else changed something
// tells the truth. These are the two cases the rest of the suite does not
// already cover: the room-side ones — membership revoked, room archived, room
// deleted — live in "the room a thread was started in goes away" and in
// chat.permission.spec.ts.

test.describe("AI Chat - state changed by another actor", () => {
  test("PUT /api/2.0/ai/assignments/assign - a thread started after the rebinding takes the new model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The complement of "rebinding Chat does not move an existing thread":
    // together they say the assignment is the default for *new* conversations
    // and never a retroactive setting. Both halves matter to a client that
    // re-reads assignments — moving old threads would rewrite history it has
    // already rendered, and not applying to new ones would make the setting
    // look broken.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rebinding Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    expect(
      (
        await profiles.assign("owner", {
          actionType: "Chat",
          profileId: first.id,
        })
      ).data?.success,
    ).toBe(true);

    // A thread that takes the default rather than naming a model: the send
    // carries no profileId, so what it runs on is whatever Chat is bound to.
    const before = await aiChat.createThreadId("owner", {
      title: "Autotest thread before the rebinding",
      profileId: first.id,
      agentId: roomId,
    });

    expect(
      (
        await profiles.assign("owner", {
          actionType: "Chat",
          profileId: second.id,
        })
      ).data?.success,
    ).toBe(true);
    expect(
      (await profiles.getAllAssignments("owner")).data?.Chat,
      "the binding really changed",
    ).toBe(second.id);

    const after = await aiChat.createThreadId("owner", {
      title: "Autotest thread after the rebinding",
      profileId: second.id,
      agentId: roomId,
    });

    // Each thread kept the model it was started with, and one re-read of the
    // list shows both — no stale copy, no retroactive rewrite.
    const listed = await aiChat.listThreads("owner", roomId);
    expect(listed.status).toBe(200);
    const byId = new Map(
      listed.data.map((thread) => [thread.threadId, thread.profileId]),
    );
    expect(byId.get(before)).toBe(first.id);
    expect(byId.get(after)).toBe(second.id);
  });

  test("DELETE /api/2.0/ai/agents/{id} - deleting the agent takes its member's threads with it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The "selected agent is deleted" case. A client holding that agent's
    // thread list has to find out by re-reading, so what matters is that the
    // re-read is decisive — a 200 with the threads still in it would leave the
    // member chatting into a room that no longer exists.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Vanishing Agent",
      profileId,
    });

    const member = await apiSdk.addAuthenticatedMember("owner", "User");
    const memberId = member.data.response!.id!;
    await inviteToAgent(ownerApi.rooms, agentId, memberId);
    await aiChat.expectActingAs("user", memberId, "the member");

    const threadId = await aiChat.createThreadId("user", {
      title: "Autotest member thread",
      profileId,
      agentId,
    });
    const stored = await aiChat.appendUserMessage("user", {
      threadId,
      profileId,
      text: "written while the agent existed",
    });
    expect(stored.status).toBe(200);

    // The other actor: the owner removes the agent underneath them.
    await apiSdk.authenticateOwner();
    expect((await aiChat.deleteAgent("owner", agentId)).status).toBe(200);
    expect(await aiChat.waitForAgentDeleted("owner", agentId)).toBe(404);

    // Now the member re-reads. Everything about the agent has to be refused or
    // empty — and it is the *entity* that is gone, so a listing that still
    // returned the thread would be the client's cue to keep showing it.
    await apiSdk.authenticateMember(member.userData, "User");
    await aiChat.expectActingAs("user", memberId, "the member again");

    const listed = await aiChat.listThreads("user", agentId);
    expect(listed.status).toBe(200);
    expect(
      listed.data.map((thread) => thread.threadId),
      "the deleted agent lists no threads",
    ).not.toContain(threadId);

    const info = await aiChat.getAgentInfo("user", agentId);
    expect(info.status, "and the agent itself is gone for them too").toBe(404);
  });
});
