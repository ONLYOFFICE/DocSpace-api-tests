import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
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

// The routes chat.ai-disabled.spec.ts / messages.spec.ts do not gate-check:
// open-or-create and regenerate-title, plus the message-level reads and the
// thread-level writes once more against ONE real thread, with the portal AI switch
// off. Every call runs against a thread and message created while AI was on — a
// made-up id would make a 403 indistinguishable from "that id does not exist".
//
// With the switch back on, the thread must be exactly what it was: a refused call
// writes nothing.

type GatedCall = {
  route: string;
  act: (
    client: ThreadsClient,
    ctx: ThreadsCtx,
    threadId: string,
    messageId: string,
  ) => Promise<{ status: number }>;
};

const GATED: GatedCall[] = [
  {
    route: "POST /api/2.0/ai/threads/open-or-create",
    act: (client, ctx, threadId) =>
      client.aiThreadsOpenOrCreate({
        aiThreadsOpenOrCreateRequest: {
          threadId,
          profileId: ctx.profileId,
          profile: sdkProfile(ctx),
          entityId: String(ctx.agentId),
          firstMessage: { role: "user", content: "while AI is off" },
        },
      }),
  },
  {
    route: "POST /api/2.0/ai/threads/regenerate-title",
    act: (client, ctx, threadId) =>
      client.aiThreadsRegenerateTitle({
        aiThreadsRegenerateTitleRequest: { threadId, profile: sdkProfile(ctx) },
      }),
  },
  {
    route: "GET /api/2.0/ai/threads/list (query and count)",
    act: (client, ctx) =>
      client.aiThreadsList({
        entityId: String(ctx.agentId),
        query: "Gated",
        count: 1,
      }),
  },
  {
    route: "GET /api/2.0/ai/threads/read-messages (direction=desc, count)",
    act: (client, _ctx, threadId) =>
      client.aiThreadsReadMessages({ threadId, count: 1, direction: "desc" }),
  },
  {
    route: "GET /api/2.0/ai/threads/get-message-by-id",
    act: (client, _ctx, _threadId, messageId) =>
      client.aiThreadsGetMessageById({ messageId }),
  },
];

test.describe("Threads - AI Disabled: the routes the other suites leave out", () => {
  for (const { route, act } of GATED) {
    test(`${route} - returns 403 when AI access is disabled and writes nothing`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ctx = await threadsSetup(apiSdk, paymentsApi);
      const threadId = await createThread(ctx, "Gated thread");
      const messageId = await appendText(ctx, threadId, "from before");
      const before = await snapshotThread(ctx, threadId);
      const listBefore = await listThreadIds(ctx);

      const ownerApi = apiSdk.forRole("owner");
      const off = await setPortalAiAccess(ownerApi, false);
      expect(off.writeStatus).toBe(200);
      expect(off.enabled, "the portal AI switch is really off").toBe(false);

      const { status } = await act(ctx.api, ctx, threadId, messageId);

      const on = await setPortalAiAccess(ownerApi, true);
      expect(on.enabled, "the portal AI switch is back on").toBe(true);
      expect(await snapshotThread(ctx, threadId)).toEqual(before);
      expect(await listThreadIds(ctx), "no thread appeared").toEqual(
        listBefore,
      );

      expect(status).toBe(403);
    });
  }
});
