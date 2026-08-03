import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  AiAgentChat,
  AgentRole,
  inviteToAgent,
} from "@/src/helpers/ai-agent-chat";
import { ApiSDK, UserType } from "@/src/services/api-sdk";

// Threads are per-user, not per-room: even a ContentCreator in the agent room
// cannot open, change or write into another member's thread. That replaces the
// old BUG 80791 / 80797 / 80801 matrices, which were about chats owned by the
// room.
//
// The matrix covers every thread operation, not just the readers. A backend can
// perfectly well refuse `get-by-id` on someone else's thread and still accept
// `append-user-message` or `send-with-stream` against the same threadId, so
// clear-messages / touch / append / send are checked here too.
//
// Anonymous checks live in their own tests on purpose. `apiSdk.request` is a
// shared context whose session cookie outranks the bearer header, so once any
// member has authenticated in a test, dropping the header no longer produces an
// anonymous request. For the same reason no test calls `authenticateOwner()`
// before the member acts — that would silently run the member's calls as the
// owner.

/** Never invited into the agent. Guest included — outsiders of any type. */
const NON_MEMBER_ROLES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
  { type: "Guest", role: "guest" },
];

/**
 * Roles that can be real members of an agent. Guest is not one of them: an
 * agent room grants a Guest nothing above Read, and Read is refused on every
 * thread route — both pinned in "Agent room membership" below. Running the
 * isolation matrix over a Read-level Guest would collect 403s that say nothing
 * about isolation, since that member cannot reach the agent at all.
 */
const MEMBER_ROLES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
];

const OWNER_THREAD_TITLE = "Owner thread";
const OWNER_MESSAGE = "A private note";

/**
 * Proves the refused create really created nothing.
 *
 * An outsider's own thread list is refused too, and threads are per-user so the
 * owner cannot see into someone else's list either — there is no readable
 * surface while the caller is still an outsider. So the caller is invited
 * afterwards, which opens their list, and a thread they then create legitimately
 * serves as the positive control: the list demonstrably shows threads, and the
 * one from the refused call is not among them.
 */
async function expectNoThreadWasCreated(
  apiSdk: ApiSDK,
  aiChat: AiAgentChat,
  role: AgentRole,
  memberId: string,
  agentId: number,
  profileId: string,
) {
  await inviteToAgent(apiSdk.forRole("owner").rooms, agentId, memberId);

  const afterInvite = await aiChat.listThreads(role, agentId);
  expect(afterInvite.status).toBe(200);
  expect(afterInvite.data).toEqual([]);

  const control = await aiChat.createThreadId(role, {
    title: "Control thread",
    profileId,
    agentId,
  });
  const withControl = await aiChat.listThreads(role, agentId);
  expect(withControl.status).toBe(200);
  expect(withControl.data.map((thread) => thread.threadId)).toEqual([control]);
}

test.describe("Threads - access control for non-members", () => {
  test("POST /api/2.0/ai/threads/create - DocSpaceAdmin not in the agent cannot start a thread", async ({
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
      "DocSpaceAdmin",
    );

    const { status, error, threadId } = await aiChat.createThread(
      "docSpaceAdmin",
      { title: "Uninvited thread", profileId, agentId },
    );

    expect(threadId).toBe("");
    await expectNoThreadWasCreated(
      apiSdk,
      aiChat,
      "docSpaceAdmin",
      memberData.response!.id!,
      agentId,
      profileId,
    );

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  // DocSpaceAdmin gets a clean 403 (above); every other role crashes the
  // handler instead of being refused.
  for (const { type, role } of NON_MEMBER_ROLES.filter(
    (entry) => entry.role !== "docSpaceAdmin",
  )) {
    test(`BUG 82715: POST /api/2.0/ai/threads/create - ${role} not in the agent gets 500 instead of 403`, async ({
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

      const { status, threadId } = await aiChat.createThread(role, {
        title: "Uninvited thread",
        profileId,
        agentId,
      });

      // Whatever the status, the crash must not have left a thread behind.
      expect(threadId).toBe("");
      if (role !== "guest") {
        // Guests cannot be granted content access, so the invite-and-look
        // control is not available for them — see "Agent room membership".
        await expectNoThreadWasCreated(
          apiSdk,
          aiChat,
          role,
          memberData.response!.id!,
          agentId,
          profileId,
        );
      }

      // Refusing an outsider is a 403, not an Internal Server Error.
      test.fail();
      expect(status).toBe(403);
    });
  }
});

type IsolationContext = {
  aiChat: AiAgentChat;
  profileId: string;
  agentId: number;
  threadId: string;
  lastEditDate: number;
};

/**
 * Owner creates an agent and a thread with one message in it, then the member
 * is created and invited. Order matters twice over: all owner-side work happens
 * before the member authenticates, and the invitation status is asserted so a
 * failed invite cannot masquerade as a permission contract.
 */
async function ownerThreadWithMember(
  apiSdk: ApiSDK,
  type: UserType,
  access: FileShare = FileShare.ContentCreator,
): Promise<IsolationContext> {
  const ownerApi = apiSdk.forRole("owner");
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: "Autotest Chat Agent",
    profileId,
  });
  const threadId = await aiChat.createThreadId("owner", {
    title: OWNER_THREAD_TITLE,
    profileId,
    agentId,
  });
  const appended = await aiChat.appendUserMessage("owner", {
    threadId,
    profileId,
    text: OWNER_MESSAGE,
  });
  expect(appended.status, "seeding the owner's thread").toBe(200);

  const thread = await aiChat.getThread("owner", threadId);
  expect(thread.status).toBe(200);

  const { data: memberData } = await apiSdk.addAuthenticatedMember(
    "owner",
    type,
  );
  await inviteToAgent(
    ownerApi.rooms,
    agentId,
    memberData.response!.id!,
    access,
  );

  return {
    aiChat,
    profileId,
    agentId,
    threadId,
    lastEditDate: thread.data!.lastEditDate!,
  };
}

/** Everything the owner's thread must still look like afterwards. */
async function expectOwnerThreadIntact(
  apiSdk: ApiSDK,
  context: IsolationContext,
) {
  await apiSdk.authenticateOwner();
  const { aiChat, agentId, threadId, lastEditDate } = context;

  const list = await aiChat.listThreads("owner", agentId);
  expect(list.status).toBe(200);
  expect(list.data.map((thread) => thread.threadId)).toContain(threadId);

  const thread = await aiChat.getThread("owner", threadId);
  expect(thread.status).toBe(200);
  expect(thread.data?.title).toBe(OWNER_THREAD_TITLE);
  expect(thread.data?.lastEditDate).toBe(lastEditDate);

  const messages = await aiChat.readMessages("owner", threadId);
  expect(messages.status).toBe(200);
  expect(messages.data).toHaveLength(1);
  expect(AiAgentChat.messageText(messages.data[0])).toBe(OWNER_MESSAGE);
}

type IsolationOperation = {
  route: string;
  description: string;
  act: (
    context: IsolationContext,
    role: AgentRole,
  ) => Promise<{ status: number; error?: string }>;
};

const REFUSED_OPERATIONS: IsolationOperation[] = [
  {
    route: "GET /api/2.0/ai/threads/get-by-id",
    description: "cannot read Owner's thread",
    act: ({ aiChat, threadId }, role) => aiChat.getThread(role, threadId),
  },
  {
    route: "GET /api/2.0/ai/threads/read-messages",
    description: "cannot read Owner's messages",
    act: ({ aiChat, threadId }, role) => aiChat.readMessages(role, threadId),
  },
  {
    route: "PUT /api/2.0/ai/threads/rename",
    description: "cannot rename Owner's thread",
    act: ({ aiChat, threadId }, role) =>
      aiChat.renameThread(role, threadId, "Hacked title"),
  },
  {
    route: "DELETE /api/2.0/ai/threads/delete",
    description: "cannot delete Owner's thread",
    act: ({ aiChat, threadId }, role) => aiChat.deleteThread(role, threadId),
  },
  {
    route: "DELETE /api/2.0/ai/threads/clear-messages",
    description: "cannot wipe Owner's messages",
    act: ({ aiChat, threadId }, role) =>
      aiChat.clearThreadMessages(role, threadId),
  },
  {
    route: "POST /api/2.0/ai/threads/touch",
    description: "cannot touch Owner's thread",
    act: ({ aiChat, threadId }, role) => aiChat.touchThread(role, threadId),
  },
  {
    route: "POST /api/2.0/ai/threads/append-user-message",
    description: "cannot write into Owner's thread",
    act: ({ aiChat, threadId, profileId }, role) =>
      aiChat.appendUserMessage(role, {
        threadId,
        profileId,
        text: "Injected by another member",
      }),
  },
];

test.describe("Threads - isolation between members of the same agent", () => {
  for (const { type, role } of MEMBER_ROLES) {
    for (const { route, description, act } of REFUSED_OPERATIONS) {
      test(`${route} - ${role} invited to the agent ${description}`, async ({
        apiSdk,
        paymentsApi,
      }) => {
        const ownerApi = apiSdk.forRole("owner");
        await enableAiGateway(paymentsApi, ownerApi.payment);

        const context = await ownerThreadWithMember(apiSdk, type);

        const { status, error } = await act(context, role);

        await expectOwnerThreadIntact(apiSdk, context);

        expect(error).toBe("Forbidden");
        expect(status).toBe(403);
      });
    }

    test(`BUG 82717: POST /api/2.0/ai/ai/send-with-stream - ${role} invited to the agent gets 200 instead of 403 on Owner's thread`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      // Every other operation on someone else's thread is a clean 403. Sending
      // into it answers HTTP 200 with `{"type":"error","message":"stream error"}`
      // in the body instead. The thread is not actually touched — the
      // assertions below establish that before the status is checked — so this
      // is a wrong response contract rather than a data leak.
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const context = await ownerThreadWithMember(apiSdk, type);
      const { aiChat, profileId, agentId, threadId } = context;

      const { status, streamError } = await aiChat.sendMessage(role, {
        threadId,
        profileId,
        agentId,
        message: "Injected question",
      });

      // Neither the injected question nor any reply to it reached the thread.
      // The wait matters: a send that had gone through would write the user
      // message immediately and the reply a few seconds later, so checking
      // straight away could mistake a slow write for no write at all.
      await new Promise((resolve) => setTimeout(resolve, 10000));
      await expectOwnerThreadIntact(apiSdk, context);
      expect(streamError).toBe("stream error");

      test.fail();
      expect(status).toBe(403);
    });
  }
});

test.describe("Threads - anonymous access", () => {
  // Each of these endpoints sits behind its own middleware, so a 401 on create
  // says nothing about append or clear — every one of them is checked.
  type AnonymousOperation = {
    route: string;
    act: (
      aiChat: AiAgentChat,
      context: { agentId: number; threadId: string; profileId: string },
    ) => Promise<{ status: number; error?: string }>;
  };

  const ANONYMOUS_OPERATIONS: AnonymousOperation[] = [
    {
      route: "POST /api/2.0/ai/threads/create",
      act: (aiChat, { agentId, profileId }) =>
        aiChat.createThread("anonymous", {
          title: "Anonymous thread",
          profileId,
          agentId,
        }),
    },
    {
      route: "GET /api/2.0/ai/threads/list",
      act: (aiChat, { agentId }) => aiChat.listThreads("anonymous", agentId),
    },
    {
      route: "GET /api/2.0/ai/threads/get-by-id",
      act: (aiChat, { threadId }) => aiChat.getThread("anonymous", threadId),
    },
    {
      route: "GET /api/2.0/ai/threads/read-messages",
      act: (aiChat, { threadId }) => aiChat.readMessages("anonymous", threadId),
    },
    {
      route: "PUT /api/2.0/ai/threads/rename",
      act: (aiChat, { threadId }) =>
        aiChat.renameThread("anonymous", threadId, "Hacked title"),
    },
    {
      route: "DELETE /api/2.0/ai/threads/delete",
      act: (aiChat, { threadId }) => aiChat.deleteThread("anonymous", threadId),
    },
    {
      route: "DELETE /api/2.0/ai/threads/clear-messages",
      act: (aiChat, { threadId }) =>
        aiChat.clearThreadMessages("anonymous", threadId),
    },
    {
      route: "POST /api/2.0/ai/threads/touch",
      act: (aiChat, { threadId }) => aiChat.touchThread("anonymous", threadId),
    },
    {
      route: "POST /api/2.0/ai/threads/append-user-message",
      act: (aiChat, { threadId, profileId }) =>
        aiChat.appendUserMessage("anonymous", {
          threadId,
          profileId,
          text: "anonymous",
        }),
    },
    {
      route: "POST /api/2.0/ai/ai/send-with-stream",
      act: (aiChat, { threadId, profileId, agentId }) =>
        aiChat.sendMessage("anonymous", {
          threadId,
          profileId,
          agentId,
          message: "Hello",
        }),
    },
    {
      // Replaces the removed GET /ai/chats/models.
      route: "GET /api/2.0/ai/profiles/list",
      act: (aiChat) => aiChat.getProfiles("anonymous"),
    },
  ];

  for (const { route, act } of ANONYMOUS_OPERATIONS) {
    test(`${route} - Anonymous gets 401`, async ({ apiSdk, paymentsApi }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Chat Agent",
        profileId,
      });
      const threadId = await aiChat.createThreadId("owner", {
        title: OWNER_THREAD_TITLE,
        profileId,
        agentId,
      });
      const appended = await aiChat.appendUserMessage("owner", {
        threadId,
        profileId,
        text: OWNER_MESSAGE,
      });
      expect(appended.status).toBe(200);
      const before = await aiChat.getThread("owner", threadId);
      expect(before.status).toBe(200);

      const { status, error } = await act(aiChat, {
        agentId,
        threadId,
        profileId,
      });

      await expectOwnerThreadIntact(apiSdk, {
        aiChat,
        profileId,
        agentId,
        threadId,
        lastEditDate: before.data!.lastEditDate!,
      });

      expect(error).toBe("Unauthorized");
      expect(status).toBe(401);
    });
  }
});

test.describe("Threads - members without content access", () => {
  // Being in the agent room is not enough. A member invited at Read is refused
  // on the thread surface outright, which is what closes Guests out of agents
  // altogether: Read is the only level a Guest can be granted.
  const READ_ONLY_MEMBERS: Array<{ type: UserType; role: AgentRole }> = [
    { type: "User", role: "user" },
    { type: "Guest", role: "guest" },
  ];

  for (const { type, role } of READ_ONLY_MEMBERS) {
    test(`POST /api/2.0/ai/threads/create - ${role} invited at Read cannot start a thread`, async ({
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
      // Asserted inside the helper: the refusal below is about the access
      // level, not about an invitation that never landed.
      await inviteToAgent(
        ownerApi.rooms,
        agentId,
        memberData.response!.id!,
        FileShare.Read,
      );

      const { status, error, threadId } = await aiChat.createThread(role, {
        title: "Read-only member thread",
        profileId,
        agentId,
      });

      expect(threadId).toBe("");
      const list = await aiChat.listThreads(role, agentId);
      expect(list.error).toBe("Forbidden");
      expect(list.status).toBe(403);

      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });
  }
});

test.describe("Agent room membership", () => {
  const REFUSED_GUEST_LEVELS: Array<{ label: string; access: FileShare }> = [
    { label: "Editing", access: FileShare.Editing },
    { label: "ContentCreator", access: FileShare.ContentCreator },
    { label: "RoomManager", access: FileShare.RoomManager },
  ];

  for (const { label, access } of REFUSED_GUEST_LEVELS) {
    test(`PUT /api/2.0/files/rooms/{id}/share - an agent room refuses ${label} for a Guest`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      // Read is the ceiling for a Guest in an agent room, which is why the
      // positive chat coverage in chat.spec.ts invites Guests at Read.
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Chat Agent",
        profileId,
      });

      const { data: guestData } = await apiSdk.addMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      const { status, data } = await ownerApi.rooms.setRoomSecurity({
        id: agentId,
        roomInvitationRequest: {
          invitations: [{ id: guestId, access }],
          notify: false,
        },
      });

      expect(status).toBe(403);
      expect((data as any).error?.message).toBe(
        "The role is not available for this user type",
      );

      // Read still goes through, so the refusal is about the level and not
      // about Guests being barred from agent rooms altogether.
      const readInvite = await ownerApi.rooms.setRoomSecurity({
        id: agentId,
        roomInvitationRequest: {
          invitations: [{ id: guestId, access: FileShare.Read }],
          notify: false,
        },
      });
      expect(readInvite.status).toBe(200);
    });
  }
});

test.describe("Threads - validation", () => {
  test("GET /api/2.0/ai/threads/get-by-id - a malformed threadId is rejected", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { status, error } = await aiChat.getThread("owner", "abc");

    expect(error).toBe("Bad Request");
    expect(status).toBe(400);
  });

  test("BUG 82718: GET /api/2.0/ai/threads/get-by-id - an unknown threadId returns 200 with a null body instead of 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { status, data, text } = await aiChat.getThread(
      "owner",
      "019f0000-0000-7000-8000-000000000000",
    );

    // Pinned so a partial fix cannot keep passing as "the same known bug": if
    // the body ever stops being a bare `null` — say it starts returning someone
    // else's thread — this fails loudly instead of staying an expected failure.
    expect(text).toBe("null");
    expect(data).toBeNull();

    // read-messages, on the same unknown id, does get this right — which is why
    // 404 is the expectation here rather than a matter of taste.
    const messages = await aiChat.readMessages(
      "owner",
      "019f0000-0000-7000-8000-000000000000",
    );
    expect(messages.status).toBe(404);

    test.fail();
    expect(status).toBe(404);
  });

  test("BUG 82719: POST /api/2.0/ai/threads/create - a non-existent agent id creates an orphan thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const fakeAgentId = 999999999;

    const { status, threadId } = await aiChat.createThread("owner", {
      title: "Orphan thread",
      profileId,
      agentId: fakeAgentId,
    });

    // Not merely "accepted": the thread is really persisted and readable, and
    // it is listed under the entity id of an agent that does not exist.
    expect(threadId).toBeTruthy();
    const thread = await aiChat.getThread("owner", threadId);
    expect(thread.status).toBe(200);
    expect(thread.data?.title).toBe("Orphan thread");

    const list = await aiChat.listThreads("owner", fakeAgentId);
    expect(list.status).toBe(200);
    expect(list.data.map((entry) => entry.threadId)).toContain(threadId);

    test.fail();
    expect(status).toBe(404);
  });

  test("BUG 82720: POST /api/2.0/ai/ai/send-with-stream - an empty message is stored and forwarded to the model", async ({
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

    const { status } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "",
    });

    // "Accepted" here means more than HTTP 200: the empty message is persisted
    // as a real user message and handed to the provider. What the provider then
    // does with it is not a stable contract — some models answer it, others
    // refuse with `status.error.code === "bad_request"` — so the assertions stop
    // at the part the portal itself is responsible for.
    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    const asked = AiAgentChat.userMessages(messages);
    expect(asked).toHaveLength(1);
    expect(AiAgentChat.messageText(asked[0])).toBe("");
    expect(AiAgentChat.assistantMessages(messages)).toHaveLength(1);

    // Validation belongs at the edge: an empty message should never be stored.
    test.fail();
    expect(status).toBe(400);
  });

  test("BUG 82723: POST /api/2.0/ai/ai/send-with-stream - an unknown thread reports the failure inside a 200", async ({
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

    const { status, streamError } = await aiChat.sendMessage("owner", {
      threadId: "019f0000-0000-7000-8000-000000000000",
      profileId,
      agentId,
      message: "Hello",
    });

    // The body carries {"type":"error","message":"stream error"} under a 200.
    expect(streamError).toBe("stream error");

    test.fail();
    expect(status).toBe(404);
  });
});
