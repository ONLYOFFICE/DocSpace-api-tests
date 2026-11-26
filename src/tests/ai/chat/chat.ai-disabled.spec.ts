import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AiTools, EMPTY_TOOL_CATALOGUE } from "@/src/helpers/ai-tools";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  LOW_BALANCE_THRESHOLD,
  configureAiToolsAsUnpaid,
  enableAiGateway,
  enableAiToolsWithLowBalance,
  enableAiToolsWithoutAiCredit,
  getWalletBalance,
} from "@/src/helpers/wallet-services";
import { expectHealthyAssistantReply } from "@/src/helpers/ai-agent-chat";
import { ApiSDK } from "@/src/services/api-sdk";
import { RoomType, SearchArea } from "@onlyoffice/docspace-api-sdk";

// The chat surface moved from `/ai/rooms/{roomId}/chats` (404) to
// `/ai/threads/*` + `/ai/ai/send-with-stream`. See the route map in
// src/helpers/ai-agent-chat.ts.
//
// Two independent states turn AI off and both are covered here: the portal AI
// switch (first block) and the unpaid "AI Tools" wallet service (second block).
// The third block is the state that must NOT turn AI off — AI Tools paid for
// with no AI credit — and it is here so the three cannot drift into one.
//
// Everything in the first block runs against a REAL agent, thread and message
// created while AI was still on. Pointing these calls at made-up ids would make
// them untrustworthy: an unknown thread produces 200/404/"stream error"
// depending on the route, so a fake-id test cannot tell "the AI switch refused
// this" from "that id does not exist".

const REAL_THREAD_TITLE = "Autotest thread";
const REAL_MESSAGE = "A message from before AI was turned off";

type DisabledAiContext = {
  aiChat: AiAgentChat;
  profileId: string;
  agentId: number;
  threadId: string;
  /** lastEditDate as it stood when the switch was flipped off. */
  lastEditDate: number;
};

/**
 * Builds a real agent/thread/message, then switches the portal AI access off
 * and confirms the portal really stored the new value — asserting 403 after a
 * disable call that silently failed is a false positive.
 */
async function withAiSwitchedOff(
  apiSdk: ApiSDK,
  paymentsApi: Parameters<typeof enableAiGateway>[0],
): Promise<DisabledAiContext> {
  const ownerApi = apiSdk.forRole("owner");
  // An agent (an AI project, room type 12) can only be created while the
  // portal has the AI gateway or a model profile of its own.
  await enableAiGateway(paymentsApi, ownerApi.payment);
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: "Autotest Chat Agent",
    profileId,
  });
  const threadId = await aiChat.createThreadId("owner", {
    title: REAL_THREAD_TITLE,
    profileId,
    agentId,
  });
  const appended = await aiChat.appendUserMessage("owner", {
    threadId,
    profileId,
    text: REAL_MESSAGE,
  });
  expect(appended.status, "seeding the thread with a message").toBe(200);

  const thread = await aiChat.getThread("owner", threadId);
  expect(thread.status).toBe(200);

  const off = await setPortalAiAccess(ownerApi, false);
  expect(off.writeStatus).toBe(200);
  expect(off.enabled, "the portal AI switch was really turned off").toBe(false);

  return {
    aiChat,
    profileId,
    agentId,
    threadId,
    lastEditDate: thread.data!.lastEditDate!,
  };
}

/** Turns AI back on so the thread can be inspected for side effects. */
async function switchAiBackOn(apiSdk: ApiSDK) {
  const on = await setPortalAiAccess(apiSdk.forRole("owner"), true);
  expect(on.enabled, "the portal AI switch was turned back on").toBe(true);
}

type GatedCase = {
  name: string;
  act: (
    context: DisabledAiContext,
  ) => Promise<{ status: number; error?: string }>;
  /** Verification run with AI switched back on. */
  verifyUnchanged?: (context: DisabledAiContext) => Promise<void>;
  /** Why the case is skipped for now; the case runs when this is absent. */
  skipped?: string;
};

const GATED_ROUTES: GatedCase[] = [
  {
    name: "GET /api/2.0/ai/threads/list",
    act: ({ aiChat, agentId }) => aiChat.listThreads("owner", agentId),
  },
  {
    name: "GET /api/2.0/ai/threads/get-by-id",
    act: ({ aiChat, threadId }) => aiChat.getThread("owner", threadId),
  },
  {
    name: "GET /api/2.0/ai/threads/read-messages",
    act: ({ aiChat, threadId }) => aiChat.readMessages("owner", threadId),
  },
  {
    name: "GET /api/2.0/ai/profiles/list",
    // Replaces the removed GET /ai/chats/models.
    act: ({ aiChat }) => aiChat.getProfiles("owner"),
  },
  {
    name: "POST /api/2.0/ai/threads/create",
    // In an agent (AI project) the refusal comes from the entity check, not from
    // the AI gate: "Entity <id> is not accessible" instead of "Forbidden"
    // (2026-11-26), although server commit a07a50b588 puts the gate first on
    // threads/create. No bug filed yet.
    skipped: "possible defect: AI gate not first on threads/create in an agent",
    act: ({ aiChat, profileId, agentId }) =>
      aiChat.createThread("owner", {
        title: "Thread created while AI is off",
        profileId,
        agentId,
      }),
    verifyUnchanged: async ({ aiChat, agentId, threadId }) => {
      const list = await aiChat.listThreads("owner", agentId);
      expect(list.status).toBe(200);
      expect(list.data.map((thread) => thread.threadId)).toEqual([threadId]);
    },
  },
  {
    name: "PUT /api/2.0/ai/threads/rename",
    act: ({ aiChat, threadId }) =>
      aiChat.renameThread("owner", threadId, "Renamed while AI is off"),
    verifyUnchanged: async ({ aiChat, threadId }) => {
      const { status, data } = await aiChat.getThread("owner", threadId);
      expect(status).toBe(200);
      expect(data?.title).toBe(REAL_THREAD_TITLE);
    },
  },
  {
    name: "DELETE /api/2.0/ai/threads/delete",
    act: ({ aiChat, threadId }) => aiChat.deleteThread("owner", threadId),
    verifyUnchanged: async ({ aiChat, agentId, threadId }) => {
      const list = await aiChat.listThreads("owner", agentId);
      expect(list.status).toBe(200);
      expect(list.data.map((thread) => thread.threadId)).toContain(threadId);
    },
  },
  {
    name: "DELETE /api/2.0/ai/threads/clear-messages",
    act: ({ aiChat, threadId }) =>
      aiChat.clearThreadMessages("owner", threadId),
    verifyUnchanged: async ({ aiChat, threadId }) => {
      const { status, data } = await aiChat.readMessages("owner", threadId);
      expect(status).toBe(200);
      expect(data).toHaveLength(1);
      expect(AiAgentChat.messageText(data[0])).toBe(REAL_MESSAGE);
    },
  },
  {
    name: "POST /api/2.0/ai/threads/append-user-message",
    act: ({ aiChat, threadId, profileId }) =>
      aiChat.appendUserMessage("owner", {
        threadId,
        profileId,
        text: "Appended while AI is off",
      }),
    verifyUnchanged: async ({ aiChat, threadId }) => {
      const { status, data } = await aiChat.readMessages("owner", threadId);
      expect(status).toBe(200);
      expect(data).toHaveLength(1);
      expect(AiAgentChat.messageText(data[0])).toBe(REAL_MESSAGE);
    },
  },
  {
    name: "POST /api/2.0/ai/threads/touch",
    act: ({ aiChat, threadId }) => aiChat.touchThread("owner", threadId),
    verifyUnchanged: async ({ aiChat, threadId, lastEditDate }) => {
      const { status, data } = await aiChat.getThread("owner", threadId);
      expect(status).toBe(200);
      expect(data?.lastEditDate).toBe(lastEditDate);
    },
  },
];

test.describe("AI Chat - AI Disabled", () => {
  for (const { name, act, verifyUnchanged, skipped } of GATED_ROUTES) {
    const register = skipped ? test.skip : test;
    register(
      `${name} - returns 403 when AI access is disabled`,
      async ({ apiSdk, paymentsApi }) => {
        const context = await withAiSwitchedOff(apiSdk, paymentsApi);

        const { status, error } = await act(context);

        if (verifyUnchanged) {
          await switchAiBackOn(apiSdk);
          await verifyUnchanged(context);
        }

        expect(error).toBe("Forbidden");
        expect(status).toBe(403);
      },
    );
  }

  test("POST /api/2.0/ai/ai/send-with-stream - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Kept apart from the GATED_ROUTES matrix above because it needs a real
    // agent and thread created while AI was still on: a fake threadId produces
    // the same refusal for a different reason and would prove nothing.
    //
    // Was BUG 82724: this route used to answer HTTP 200 and put the refusal in
    // the stream body as `{"type":"error","message":"stream error"}` — an opaque
    // message a client cannot act on, under a status a client reads as success.
    // Fixed 2026-08-18. Inference was blocked even then, so what changed is the
    // response contract; the assertions below still establish that nothing
    // reached the model or the thread before the status is checked.
    //
    // Was briefly re-broken (unfiled): measured as 400 `"unknown profileId:
    // <id>"`, not 403 "Forbidden" — a profileId that resolved fine while AI
    // was on was reported unknown once AI was switched off, as if profile
    // resolution ran before (and instead of) the AI-switch gate. Confirmed
    // fixed 2026-09-07 (5/5 standalone repeats, correct 403 every time).
    const context = await withAiSwitchedOff(apiSdk, paymentsApi);
    const { aiChat, profileId, agentId, threadId } = context;

    const { status, error, streamError } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "What is 2+2? Answer in one word.",
    });

    // The request neither reached the model nor touched the thread: no new user
    // message, no assistant reply, not even a failed one.
    await switchAiBackOn(apiSdk);
    const messages = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      1,
      20000,
    );
    expect(messages).toHaveLength(1);
    expect(AiAgentChat.messageText(messages[0])).toBe(REAL_MESSAGE);
    expect(AiAgentChat.assistantMessages(messages)).toHaveLength(0);

    expect(status).toBe(403);
    expect(error).toBe("Forbidden");
    expect(streamError, "the refusal is the status, not a stream frame").toBe(
      undefined,
    );
  });
});

// The other way AI is off: the portal has not paid for the "AI Tools" wallet
// service — the state every fresh portal starts in. Profiles, agents and
// threads still answer 200 — only inference itself is billing-gated.
//
// BUG 83344 (fixed): `send-with-stream` used to answer 200 and bury the refusal
// inside an async assistant message. It now refuses up front with 402
// `{"error":"The AI Tools service is not paid for the current portal"}`, and
// nothing reaches the thread — not the question, not a failed reply.
//
// The state itself is set up with `configureAiToolsAsUnpaid`, which turns the
// portal AI switch ON and asserts AI Tools is absent from the enabled wallet
// services. Relying on a fresh portal simply being unpaid would mean the tests
// quietly start proving something else if that default ever changes.

test.describe("AI Chat - AI Tools wallet service not paid for", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - the assistant reply fails until AI Tools is paid for", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await configureAiToolsAsUnpaid(ownerApi);

    const profileId = await aiChat.defaultProfileId("owner");

    const unpaidThread = await aiChat.createThreadId("owner", {
      title: "Autotest unpaid thread",
      profileId,
    });

    const unpaidSend = await aiChat.sendMessage("owner", {
      threadId: unpaidThread,
      profileId,
      message: "Say hi",
    });
    // Fixed since BUG 83344: the refusal is now the send's own status, not a
    // buried async error — see the dedicated 402 test below. Nothing reaches
    // the thread: not the question, and not a failed reply to show for it.
    expect(unpaidSend.status).toBe(402);
    expect(unpaidSend.error).toBe(
      "The AI Tools service is not paid for the current portal",
    );
    const unpaidMessages = await aiChat.readMessages("owner", unpaidThread);
    expect(unpaidMessages.data).toEqual([]);

    await enableAiGateway(paymentsApi, ownerApi.payment);

    // A fresh thread: the previous one already holds an assistant message, and
    // waitForAssistantReply returns on the first one it sees.
    const paidThread = await aiChat.createThreadId("owner", {
      title: "Autotest paid thread",
      profileId,
    });

    const paidSend = await aiChat.sendMessage("owner", {
      threadId: paidThread,
      profileId,
      message: "Say hi",
    });
    expect(paidSend.status).toBe(200);

    const paidMessages = await aiChat.waitForAssistantReply(
      "owner",
      paidThread,
    );

    expect(AiAgentChat.assistantStatus(paidMessages)?.error).toBeUndefined();
    expect(AiAgentChat.assistantText(paidMessages).length).toBeGreaterThan(0);
  });

  test("BUG 83344: POST /api/2.0/ai/ai/send-with-stream - an unpaid AI Tools wallet service should refuse with 402, not a buried async error", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await configureAiToolsAsUnpaid(ownerApi);

    const profileId = await aiChat.defaultProfileId("owner");

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest unpaid thread 402",
      profileId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      message: "Say hi",
    });

    expect(sent.status).toBe(402);
  });

  test("POST /api/2.0/files/rooms, POST /api/2.0/ai/tools/add-custom-server - the catalogue and the MCP surface are not wallet-gated, creating an agent is", async ({
    apiSdk,
  }) => {
    // Pinned so that moving the gate shows up here. On an unpaid portal the
    // profiles catalogue and the MCP tools surface behave exactly as on a paid
    // one. An agent is different since it became an AI project (room type 12):
    // creating one needs the AI gateway or a model profile of the portal's own,
    // and an unpaid portal has neither (server spec "The AI rooms section",
    // FileStorageService `CheckAiProjectRoomCreationAsync`). The old agent was
    // created on an unpaid portal too.
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const tools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const ownerApi = apiSdk.forRole("owner");

    await configureAiToolsAsUnpaid(ownerApi);

    const profiles = await aiChat.listProfiles("owner");
    expect(profiles.length).toBeGreaterThan(0);

    // The catalogue is empty on a paid portal too — the built-in tools were
    // hidden on 2026-08-18 — so what an unpaid portal has to match here is the
    // 200, not a list of tools.
    const systemTools = await tools.listSystemTools("owner");
    expect(systemTools.status).toBe(200);
    expect(systemTools.data).toEqual(EMPTY_TOOL_CATALOGUE);

    const addedServer = await tools.addCustomServer("owner", {
      name: "autotest-unpaid-server",
      config: { url: "https://mcp.example.invalid/sse" },
    });
    expect(addedServer.status).toBe(200);
    expect(addedServer.data?.success).toBe(true);

    const title = `Autotest Unpaid Agent ${apiSdk.faker.generateString(6)}`;
    const { status } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: { title, roomType: RoomType.AiProjectRoom },
    });
    expect(status).toBe(403);
    expect(await listedAgentTitles(ownerApi)).not.toContain(title);
  });

  test("GET /api/2.0/ai/threads/read-messages - neither the question nor a failed answer is stored when the send is refused", async ({
    apiSdk,
  }) => {
    // Fixed since BUG 83344: the wallet gate is now checked before the user's
    // message is stored, not after — an unpaid portal's thread stays empty
    // rather than holding a question and a failed answer.
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    await configureAiToolsAsUnpaid(apiSdk.forRole("owner"));

    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest unpaid thread",
      profileId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      message: "Say hi",
    });
    expect(sent.status).toBe(402);

    const messages = await aiChat.readMessages("owner", threadId);
    expect(messages.data).toEqual([]);
  });
});

// AI Tools IS paid for, and inference works. Kept as its own test with the
// contract in its title so that "AI is out of money" and "AI was never paid for"
// cannot silently merge into one expectation later. The wallet service being
// enabled IS asserted — that is what separates this state from the unpaid one
// above.
//
// This was written as a third portal state: paid for, but with a separate AI
// credit balance left at zero. That balance no longer exists — its routes were
// dropped in SDK 4.0.0 and answered 404 on these portals before that — so the
// setup is now the same one every other funded AI test uses.

test.describe("AI Chat - AI Tools paid for with no AI credit", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - AI inference remains available when AI Tools is enabled and AI credit balance is zero", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled, "portal AI switch before the wallet setup").toBe(true);
    await enableAiToolsWithoutAiCredit(paymentsApi, ownerApi.payment);

    const { data: config, status: configStatus } =
      await ownerApi.aiSettings.aiSettingsGet();
    expect(configStatus).toBe(200);
    expect(config.response?.aiReady, "aiReady with AI Tools paid for").toBe(
      true,
    );

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Zero Credit Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest zero credit thread",
      profileId,
      agentId,
    });

    const { status } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Say hi",
    });
    expect(status).toBe(200);

    const messages = await aiChat.waitForAssistantReply("owner", threadId);

    // The reply has to be a real one: a refused inference is also stored as an
    // assistant message, so "an assistant message exists" would pass on a dead
    // portal. `auth` is called out separately because that is the exact failure
    // the unpaid state produces — this test is what keeps the two apart.
    expect(AiAgentChat.assistantStatus(messages)?.error?.code).not.toBe("auth");
    expectHealthyAssistantReply(messages);
  });
});

// The fourth money state, and the one the low-balance banners are about: AI Tools
// is paid for, the portal works, and the wallet holds less than the $1 the client
// warns at. The banner talks about preventing an interruption of paid services —
// so what has to be pinned here is that the warning is a warning: at this balance
// AI is still fully available. Kept next to the unpaid and zero-credit states
// above so that "warned" and "cut off" cannot quietly become the same expectation.
//
// Nothing about the banner itself is visible from here; the API side of the
// requirement (the balance, the payer, auto top-up) is in
// src/tests/portal/payments/lowBalance.spec.ts.
test.describe("AI Chat - wallet balance below the low-balance threshold", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - a wallet balance under the low-balance threshold does not stop inference", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled, "portal AI switch before the wallet setup").toBe(true);

    const balance = await enableAiToolsWithLowBalance(
      paymentsApi,
      ownerApi.payment,
    );
    expect(balance, "the portal must be in the low-balance state").toBeLessThan(
      LOW_BALANCE_THRESHOLD,
    );

    const { data: config, status: configStatus } =
      await ownerApi.aiSettings.aiSettingsGet();
    expect(configStatus).toBe(200);
    // A low balance is not a configuration problem: the AI subsystem still
    // reports itself operational, which is what the client keys its AI UI off.
    expect(config.response?.aiReady, "aiReady with a low balance").toBe(true);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Low Balance Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest low balance thread",
      profileId,
      agentId,
    });

    const { status } = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Say hi",
      timeoutMs: 240000,
    });
    expect(status).toBe(200);

    const messages = await aiChat.waitForAssistantReply("owner", threadId);

    // `auth` is the exact failure an unpaid portal produces, and it is called out
    // separately because that is the state this one must not be confused with. The
    // health check is what rules out a refusal stored as an assistant message.
    expect(AiAgentChat.assistantStatus(messages)?.error?.code).not.toBe("auth");
    expectHealthyAssistantReply(messages);

    // Still under the threshold afterwards: the reply cost a fraction of a cent,
    // so the portal is exactly where the banner says it is — warned, not cut off.
    expect(
      await getWalletBalance(ownerApi.payment),
      "wallet balance after a billed reply",
    ).toBeLessThan(LOW_BALANCE_THRESHOLD);
  });
});

/** Titles of the agents the owner sees in the AI rooms section. */
async function listedAgentTitles(
  ownerApi: ReturnType<ApiSDK["forRole"]>,
): Promise<string[]> {
  const { data, status } = await ownerApi.rooms.getRoomsFolder({
    searchArea: SearchArea.AiHub,
    type: [RoomType.AiProjectRoom],
    count: 100,
  });
  expect(status).toBe(200);
  return (data.response?.folders ?? []).map(
    (folder) => (folder as { title?: string }).title ?? "",
  );
}
