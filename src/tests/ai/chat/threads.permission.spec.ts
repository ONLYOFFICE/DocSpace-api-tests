import { expect } from "@playwright/test";
import { FileShare } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { inviteToAgent } from "@/src/helpers/ai-agent-chat";
import {
  ThreadsClient,
  ThreadsCtx,
  appendText,
  createThread,
  listThreadIds,
  sdkProfile,
  snapshotThread,
  threadsSetup,
} from "@/src/helpers/ai-threads";
import { ApiSDK, UserType } from "@/src/services/api-sdk";

// Ownership matrix for ThreadsApi: every method that takes an existing thread or
// message, attempted by someone who is NOT its owner, in every standing a person
// can have towards the agent that holds it.
//
// What it adds to chat.permission.spec.ts, which already pins the seven
// thread-level routes for invited members and the per-message routes for a
// non-member: the same full matrix (thread routes, open-or-create,
// regenerate-title, the three per-message routes) for every actor, including the
// ones the product could be tempted to give a back door — a DocSpaceAdmin and a
// RoomAdmin who manages the very room the thread was started in.
//
// Threads are per-user, not per-room: being able to manage the room does not make
// the conversation theirs. Each test therefore checks three things, in this
// order: the owner's thread is byte-for-byte what it was (side effects first),
// the actor's own space still works where they have one (positive control), and
// only then that every refusal is exactly 403.
//
// Not repeated: anonymous 401 for every route (chat.permission.spec.ts),
// AI-off 403 (chat.ai-disabled.spec.ts, threads.ai-disabled.spec.ts).

type Actor = {
  label: string;
  type: UserType;
  /** null: never invited into the agent. */
  access: FileShare | null;
};

const ACTORS: Actor[] = [
  {
    label: "a DocSpaceAdmin outside the agent",
    type: "DocSpaceAdmin",
    access: null,
  },
  { label: "a RoomAdmin outside the agent", type: "RoomAdmin", access: null },
  { label: "a User outside the agent", type: "User", access: null },
  { label: "a Guest outside the agent", type: "Guest", access: null },
  {
    label: "a DocSpaceAdmin invited as ContentCreator",
    type: "DocSpaceAdmin",
    access: FileShare.ContentCreator,
  },
  {
    label: "a RoomAdmin who manages the agent room (RoomManager)",
    type: "RoomAdmin",
    access: FileShare.RoomManager,
  },
  {
    label: "a User invited as ContentCreator",
    type: "User",
    access: FileShare.ContentCreator,
  },
];

type Seed = {
  ctx: ThreadsCtx;
  threadId: string;
  messageId: string;
};

type Operation = {
  route: string;
  act: (client: ThreadsClient, seed: Seed) => Promise<{ status: number }>;
};

const ILLEGITIMATE_TEXT = "Written by someone who does not own this thread";

const OPERATIONS: Operation[] = [
  {
    route: "GET /api/2.0/ai/threads/get-by-id",
    act: (client, { threadId }) => client.aiThreadsGetById({ threadId }),
  },
  {
    route: "GET /api/2.0/ai/threads/read-messages",
    act: (client, { threadId }) => client.aiThreadsReadMessages({ threadId }),
  },
  {
    route: "PUT /api/2.0/ai/threads/rename",
    act: (client, { threadId }) =>
      client.aiThreadsRename({
        aiThreadsRenameRequest: { threadId, title: "Hijacked" },
      }),
  },
  {
    route: "POST /api/2.0/ai/threads/touch",
    act: (client, { threadId }) =>
      client.aiThreadsTouch({ aiThreadsTouchRequest: { threadId } }),
  },
  {
    route: "POST /api/2.0/ai/threads/append-user-message",
    act: (client, { ctx, threadId }) =>
      client.aiThreadsAppendUserMessage({
        aiThreadsAppendUserMessageRequest: {
          threadId,
          profileId: ctx.profileId,
          message: {
            role: "user",
            content: [{ type: "text", text: ILLEGITIMATE_TEXT }],
          },
        },
      }),
  },
  {
    route: "POST /api/2.0/ai/threads/open-or-create",
    act: (client, { ctx, threadId }) =>
      client.aiThreadsOpenOrCreate({
        aiThreadsOpenOrCreateRequest: {
          threadId,
          profileId: ctx.profileId,
          profile: sdkProfile(ctx),
          entityId: String(ctx.agentId),
          firstMessage: { role: "user", content: ILLEGITIMATE_TEXT },
        },
      }),
  },
  {
    route: "POST /api/2.0/ai/threads/regenerate-title",
    act: (client, { ctx, threadId }) =>
      client.aiThreadsRegenerateTitle({
        aiThreadsRegenerateTitleRequest: { threadId, profile: sdkProfile(ctx) },
      }),
  },
  {
    route: "GET /api/2.0/ai/threads/get-message-by-id",
    act: (client, { messageId }) =>
      client.aiThreadsGetMessageById({ messageId }),
  },
  {
    route: "PUT /api/2.0/ai/threads/update-message",
    act: (client, { messageId }) =>
      client.aiThreadsUpdateMessage({
        aiThreadsUpdateMessageRequest: {
          messageId,
          message: {
            role: "user",
            content: [{ type: "text", text: ILLEGITIMATE_TEXT }],
          },
        },
      }),
  },
  {
    route: "DELETE /api/2.0/ai/threads/delete-message",
    act: (client, { messageId }) =>
      client.aiThreadsDeleteMessage({ body: messageId }),
  },
  {
    route: "DELETE /api/2.0/ai/threads/clear-messages",
    act: (client, { threadId }) =>
      client.aiThreadsClearMessages({ body: threadId }),
  },
  {
    // Last: if it ever succeeded the other refusals would be reported against a
    // thread that no longer exists.
    route: "DELETE /api/2.0/ai/threads/delete",
    act: (client, { threadId }) => client.aiThreadsDelete({ body: threadId }),
  },
];

async function seedOwnerThread(
  apiSdk: ApiSDK,
  paymentsApi: Parameters<typeof threadsSetup>[1],
  actor: Actor,
) {
  const ctx = await threadsSetup(apiSdk, paymentsApi);
  const threadId = await createThread(ctx, "Owner thread");
  const messageId = await appendText(ctx, threadId, "A private note");
  await appendText(ctx, threadId, "A second private note");
  const before = await snapshotThread(ctx, threadId);

  // Owner-side work is done; from here the shared request context belongs to the
  // member.
  const ownerApi = apiSdk.forRole("owner");
  const { data: member, api } = await apiSdk.addAuthenticatedMember(
    "owner",
    actor.type,
  );
  if (actor.access !== null) {
    await inviteToAgent(
      ownerApi.rooms,
      ctx.agentId,
      member.response!.id!,
      actor.access,
    );
  }

  return {
    seed: { ctx, threadId, messageId } as Seed,
    before,
    memberClient: api.chat,
  };
}

test.describe("Threads - nobody but the owner reaches the owner's thread", () => {
  for (const actor of ACTORS) {
    test(`ThreadsApi - ${actor.label} is refused every route on the Owner's thread and message`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const { seed, before, memberClient } = await seedOwnerThread(
        apiSdk,
        paymentsApi,
        actor,
      );
      const { ctx, threadId } = seed;

      const outcomes: Record<string, number> = {};
      for (const { route, act } of OPERATIONS) {
        outcomes[route] = (await act(memberClient, seed)).status;
      }

      let ownThread: string | undefined;
      if (actor.access !== null) {
        // Positive control: an invited member has a working space of their own, so
        // the refusals above are about ownership and not about a dead account.
        ownThread = await createThread(
          ctx,
          "Member's own thread",
          {},
          memberClient,
        );
        await appendText(ctx, ownThread, "mine", memberClient);
        const mine = await listThreadIds(ctx, {}, memberClient);
        expect(
          mine.map((thread) => thread.threadId),
          "the member's list holds only their own thread",
        ).toEqual([ownThread]);
      }

      // Side effects before statuses: whatever the codes say, the owner's data is
      // exactly what it was.
      await apiSdk.authenticateOwner();
      expect(await snapshotThread(ctx, threadId)).toEqual(before);
      const ownerList = (await listThreadIds(ctx)).map(
        (thread) => thread.threadId,
      );
      expect(ownerList).toContain(threadId);
      if (ownThread) {
        expect(
          ownerList,
          "the member's thread is not the owner's",
        ).not.toContain(ownThread);
      }

      const expected = Object.fromEntries(
        OPERATIONS.map(({ route }) => [route, 403]),
      );
      expect(outcomes).toEqual(expected);
    });
  }
});
