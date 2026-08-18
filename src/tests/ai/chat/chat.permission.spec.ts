import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import {
  AiAgentChat,
  AgentRole,
  expectHealthyAssistantReply,
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

    test(`POST /api/2.0/ai/ai/send-with-stream - ${role} invited to the agent cannot send into Owner's thread`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      // Was BUG 82717: this was the one operation on someone else's thread that
      // answered HTTP 200 with `{"type":"error","message":"stream error"}` in
      // the body instead of the 403 all its neighbours return. Fixed
      // 2026-08-18 — it now refuses like the rest of the matrix above.
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const context = await ownerThreadWithMember(apiSdk, type);
      const { aiChat, profileId, agentId, threadId } = context;

      const { status, error, streamError } = await aiChat.sendMessage(role, {
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

      expect(status).toBe(403);
      expect(error).toBe("Forbidden");
      expect(streamError, "the refusal is the status, not a stream frame").toBe(
        undefined,
      );
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

// Everything above is about an agent as the entity. The chat context is wider
// now: `entityId` carries whichever room or folder the user has open, so the
// same access questions have to be asked about an ordinary room and about a
// folder — a scope the caller can name without being able to open it.
//
// Measured 2026-08-06, and the two halves come out differently:
//
//   * An entity the caller cannot open at all — someone else's room, someone
//     else's folder — crashes the handler instead of refusing it. Same symptom
//     and same root as BUG 82715 (a non-member naming an agent), so the tests
//     below carry that number rather than a new one. Nothing is created, so the
//     defect is the status alone.
//   * Read access, which closes an agent off completely, does NOT close an
//     ordinary room: a Read-level member starts a thread there and gets a real
//     answer. That is the positive case for "chat is available in any room".
//
// The room cases reuse `expectNoThreadWasCreated`: the invite it performs is a
// plain setRoomSecurity, which works on any room, and the list it then reads is
// the caller's own — a thread the refused call had created would surface in it
// (every non-agent entity shares one per-user bucket, BUG 82855), so the control
// is if anything stronger here than for an agent.
test.describe("Threads - access control on a room or folder entity", () => {
  test("BUG 82715: POST /api/2.0/ai/threads/create - a User not in the room gets 500 instead of 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Private Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;
    await aiChat.expectActingAs("user", memberId, "the non-member");

    const { status, threadId } = await aiChat.createThread("user", {
      title: "Outsider room thread",
      profileId,
      agentId: roomId,
    });

    // Whatever the status, the crash must not have left a thread behind.
    expect(threadId).toBe("");
    await expectNoThreadWasCreated(
      apiSdk,
      aiChat,
      "user",
      memberId,
      roomId,
      profileId,
    );

    // Refusing an outsider is a 403, not an Internal Server Error.
    test.fail();
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/threads/create - a member invited at Read can start a thread in the room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Read Only Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    // Asserted inside the helper, so what follows is about the access level and
    // not about an invitation that never landed.
    await inviteToAgent(ownerApi.rooms, roomId, memberId, FileShare.Read);
    await aiChat.expectActingAs("user", memberId, "the Read-level member");

    // Read is the level that closes an *agent* off entirely ("members without
    // content access" above). An ordinary room is not the agent's quota, and
    // the chat opened next to it belongs to the user, so the same level is
    // enough here.
    const { status, threadId } = await aiChat.createThread("user", {
      title: "Read-only member room thread",
      profileId,
      agentId: roomId,
    });
    expect(status).toBe(200);
    expect(threadId).toBeTruthy();

    const listed = await aiChat.listThreads("user", roomId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);

    // And it is a usable chat, not just a record: a Read-level member gets an
    // actual answer in a room they can only look at.
    const sent = await aiChat.sendMessage("user", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("user", threadId);
    expectHealthyAssistantReply(messages);
  });

  test("BUG 82715: POST /api/2.0/ai/threads/create - another user's personal folder gets 500 instead of 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const { data: folder } = await ownerApi.folders.createFolder({
      folderId: myFolder.response!.current!.id!,
      createFolder: { title: "Autotest Owner Private Folder" },
    });
    const folderId = folder.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await aiChat.expectActingAs(
      "user",
      memberData.response!.id!,
      "the outsider",
    );

    // A folder in someone else's Documents is not a place this user can chat
    // in, and the id is guessable — it is a small integer.
    const { status, threadId } = await aiChat.createThread("user", {
      title: "Outsider folder thread",
      profileId,
      agentId: folderId,
    });

    expect(threadId).toBe("");

    // Positive control: the very same caller can open a thread on a folder that
    // IS theirs, so the refusal above is about this folder's owner and not about
    // the route being closed to them.
    const { data: memberFolder } = await apiSdk
      .forRole("user")
      .folders.getMyFolder();
    const control = await aiChat.createThread("user", {
      title: "Control thread",
      profileId,
      agentId: memberFolder.response!.current!.id!,
    });
    expect(control.status, "the caller's own Documents").toBe(200);
    expect(control.threadId).toBeTruthy();

    // Refusing a folder the caller cannot open is a 403, not a crash.
    test.fail();
    expect(status).toBe(403);
  });
});

// Access to a location is not granted once and for good: a member can be taken
// out of the room after they have chatted in it. Measured 2026-08-06, the two
// halves of the surface part ways at that point — the room-scoped routes stop
// working (badly, with a 500) while the thread itself stays fully usable.
//
// The split below is deliberate. A thread is per-user and its content is the
// caller's own writing, so keeping it is defensible; naming a room they can no
// longer open is not, and that is the half asserted as a defect.
test.describe("Threads - the room membership is revoked", () => {
  /**
   * Room + a member who chatted in it and was then removed. Every step is
   * asserted here: a revoke that silently failed would make the whole block
   * describe a membership that never ended.
   */
  async function chattedThenRemoved(
    apiSdk: ApiSDK,
    aiChat: AiAgentChat,
    profileId: string,
  ) {
    const ownerApi = apiSdk.forRole("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Revoked Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const member = await apiSdk.addMember("owner", "RoomAdmin");
    const memberId = member.data.response!.id!;
    await inviteToAgent(ownerApi.rooms, roomId, memberId);

    await apiSdk.authenticateMember(member.userData, "RoomAdmin");
    await aiChat.expectActingAs("roomAdmin", memberId, "the member");

    const threadId = await aiChat.createThreadId("roomAdmin", {
      title: "Thread from when they were a member",
      profileId,
      agentId: roomId,
    });
    const stored = await aiChat.appendUserMessage("roomAdmin", {
      threadId,
      profileId,
      text: "written while still a member",
    });
    expect(stored.status, "the member's message is stored").toBe(200);

    // The owner keeps acting through the SDK client, which carries its own
    // token and is not affected by the shared context's session cookie.
    const revoked = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.None }],
        notify: false,
      },
    });
    expect(revoked.status, "removing the member from the room").toBe(200);

    // The room itself is untouched — what changed is only this user's access.
    const roomAfter = await ownerApi.rooms.getRoomInfo({ id: roomId });
    expect(roomAfter.status, "the room still exists").toBe(200);

    return { roomId, threadId };
  }

  test("BUG 82858: GET /api/2.0/ai/threads/list, POST /api/2.0/ai/threads/create - a removed member crashes both instead of being refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const { roomId } = await chattedThenRemoved(apiSdk, aiChat, profileId);

    const listed = await aiChat.listThreads("roomAdmin", roomId);
    const created = await aiChat.createThread("roomAdmin", {
      title: "Thread from after they were removed",
      profileId,
      agentId: roomId,
    });

    // Control: the route still works for this caller on a scope they may name,
    // so the failures above are about the room and not about a broken session.
    const bucket = await aiChat.listThreads(
      "roomAdmin",
      "autotest-not-an-entity",
    );
    expect(bucket.status, "a scope the caller may name").toBe(200);

    // Same defect as an outsider who never was a member: the access check
    // crashes where it should refuse.
    test.fail();
    expect(listed.status, "listing the threads of a room they left").toBe(403);
    expect(created.status).toBe(403);
  });

  test("GET|PUT|POST /api/2.0/ai/threads/* - a removed member keeps the thread they wrote in the room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const { threadId } = await chattedThenRemoved(apiSdk, aiChat, profileId);

    // The thread is the user's own writing, not the room's content, so losing
    // the room does not take it away.
    const info = await aiChat.getThread("roomAdmin", threadId);
    expect(info.status).toBe(200);
    expect(info.data?.threadId).toBe(threadId);

    const read = await aiChat.readMessages("roomAdmin", threadId);
    expect(read.status).toBe(200);
    expect(
      AiAgentChat.userMessages(read.data).map(AiAgentChat.messageText),
    ).toEqual(["written while still a member"]);

    const renamed = await aiChat.renameThread(
      "roomAdmin",
      threadId,
      "Renamed after leaving",
    );
    expect(renamed.status).toBe(200);
    expect((await aiChat.getThread("roomAdmin", threadId)).data?.title).toBe(
      "Renamed after leaving",
    );

    const appended = await aiChat.appendUserMessage("roomAdmin", {
      threadId,
      profileId,
      text: "written after leaving",
    });
    expect(appended.status).toBe(200);
    expect(
      (await aiChat.readMessages("roomAdmin", threadId)).data,
    ).toHaveLength(2);

    // Whether the model can still reach the room's own content through this
    // thread is a separate question — it needs a vectorised room holding a file
    // only members may read — and is not covered here.
  });

  test("BUG 82717: POST /api/2.0/ai/ai/send-with-stream - a removed member is blocked, but with a 200 instead of 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The important half is good news: losing the room really does stop the
    // conversation from going any further. Nothing new is written and the model
    // is never called, so a user who was taken out of a room cannot keep asking
    // questions in its context — which is what the routes above, all still
    // answering 200, might suggest.
    //
    // What is wrong is only how the refusal is delivered: HTTP 200 with
    // `{"type":"error","message":"stream error"}` in the body, the same wrong
    // response contract as BUG 82717 on another member's thread.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const { roomId, threadId } = await chattedThenRemoved(
      apiSdk,
      aiChat,
      profileId,
    );

    const { status, streamError } = await aiChat.sendMessage("roomAdmin", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });

    // The wait matters: a send that had gone through would store the user
    // message at once and the reply seconds later, so looking straight away
    // could mistake a slow write for no write at all.
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const after = await aiChat.readMessages("roomAdmin", threadId);
    expect(after.status).toBe(200);

    // The question itself is stored — writing into their own thread is still
    // allowed, exactly as `append-user-message` is in the test above. What does
    // not happen is the answer: the model is never reached.
    expect(
      AiAgentChat.assistantMessages(after.data),
      "the model was never called for a user who left the room",
    ).toEqual([]);
    expect(streamError).toBe("stream error");

    test.fail();
    expect(status).toBe(403);
  });
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

  test("BUG 82718: GET /api/2.0/ai/threads/get-by-id - an unknown threadId is a 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    // It used to answer a bare `null` under a 200, which a caller could not tell
    // from "a thread with no fields".
    const { status, error } = await aiChat.getThread(
      "owner",
      "019f0000-0000-7000-8000-000000000000",
    );
    expect(status).toBe(404);
    expect(error).toBe("thread not found");

    // read-messages, on the same unknown id, agrees.
    const messages = await aiChat.readMessages(
      "owner",
      "019f0000-0000-7000-8000-000000000000",
    );
    expect(messages.status).toBe(404);
  });

  test("BUG 82719: POST /api/2.0/ai/threads/create - a non-existent agent id is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const fakeAgentId = 999999999;

    // It used to be accepted and really persisted: the thread was readable and
    // listed under the entity id of an agent that does not exist.
    const { status, threadId, error } = await aiChat.createThread("owner", {
      title: "Orphan thread",
      profileId,
      agentId: fakeAgentId,
    });

    expect(status).toBe(404);
    expect(error).toBe(`Entity "${fakeAgentId}" not found`);
    expect(threadId, "and no thread came back").toBe("");
  });

  // The rest of the kinds of id the widened chat context makes reachable. There
  // is no entity *type* in the protocol — `entityId` is one string, and rooms
  // and folders share the files id space — so the only thing the backend can
  // check is whether the id names a place this user can chat in.
  //
  // Since the fix above it does check, and answers 404 for an id that resolves
  // to nothing: a file, a deleted room and out-of-range numbers are all refused
  // now. What is left is the Trash root, which resolves to a real folder and is
  // accepted, and the status codes — a file that exists but is not a place is a
  // 404 like an id that does not exist at all.
  //
  // Every case is collected first and asserted as one list, so the failure diff
  // names each kind and what it actually answered instead of stopping at the
  // first one.
  test("BUG 82719: POST /api/2.0/ai/threads/create - the Trash root is still accepted as an entity", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: file } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Entity Probe" },
    });
    const fileId = file.response!.id!;

    const { data: doomed } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Doomed Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const deletedRoomId = doomed.response!.id!;
    await ownerApi.rooms.deleteRoom({
      id: deletedRoomId,
      deleteRoomRequest: { deleteAfter: false },
    });
    await waitForOperation(ownerApi.operations);
    expect(
      (await ownerApi.rooms.getRoomInfo({ id: deletedRoomId })).status,
      "the room is really gone",
    ).toBe(404);

    const { data: trash } = await ownerApi.folders.getTrashFolder({});
    const trashId = trash.response!.current!.id!;

    // A file is not a folder, a deleted room is not a place, Trash is not a
    // chat context, and 0 / -1 are not ids at all.
    const KINDS: Array<{ kind: string; entityId: number; expected: number }> = [
      { kind: "a file", entityId: fileId, expected: 403 },
      { kind: "a deleted room", entityId: deletedRoomId, expected: 404 },
      { kind: "the Trash root", entityId: trashId, expected: 403 },
      { kind: "id 0", entityId: 0, expected: 400 },
      { kind: "id -1", entityId: -1, expected: 400 },
    ];

    const results: Array<{ kind: string; status: number }> = [];
    for (const { kind, entityId } of KINDS) {
      const { status } = await aiChat.createThread("owner", {
        title: `Thread on ${kind}`,
        profileId,
        agentId: entityId,
      });
      results.push({ kind, status });
    }

    test.fail();
    expect(results).toEqual(
      KINDS.map(({ kind, expected }) => ({ kind, status: expected })),
    );
  });

  test("BUG 82720: POST /api/2.0/ai/ai/send-with-stream - an empty message is refused", async ({
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

    // It used to be accepted with a 200 — persisted as a real user message and
    // handed to the provider. Validation belongs at the edge.
    const { status, error } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "",
    });
    expect(status).toBe(400);
    expect(error).toBe("userMessage must contain non-empty text content");

    // And nothing was written: the thread is still empty on both sides.
    const messages = await aiChat.readMessages("owner", threadId);
    expect(AiAgentChat.userMessages(messages.data)).toEqual([]);
    expect(AiAgentChat.assistantMessages(messages.data)).toEqual([]);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - an unknown thread is refused with a 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Was BUG 82723: the refusal used to arrive as HTTP 200 carrying
    // {"type":"error","message":"stream error"} in the streamed body — a status
    // a client reads as success. Fixed 2026-08-18; the stream now never opens.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
    });

    const { status, error, streamError } = await aiChat.sendMessage("owner", {
      threadId: "019f0000-0000-7000-8000-000000000000",
      profileId,
      agentId,
      message: "Hello",
    });

    expect(status).toBe(404);
    expect(error).toBe("Not Found");
    expect(streamError, "the refusal is the status, not a stream frame").toBe(
      undefined,
    );
  });
});
