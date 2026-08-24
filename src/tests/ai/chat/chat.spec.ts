import { expect } from "@playwright/test";
import {
  RoomType,
  FileShare,
  FileType,
  FolderType,
} from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import {
  enableAiGateway,
  configureAiToolsAsUnpaid,
} from "@/src/helpers/wallet-services";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import {
  AiAgentChat,
  AgentRole,
  AiThreadMessage,
  expectHealthyAssistantReply,
  inviteToAgent,
  twoTextProfiles,
} from "@/src/helpers/ai-agent-chat";
import { AiAttachments } from "@/src/helpers/ai-attachments";
import { AiHttp } from "@/src/helpers/ai-http";
import { postAndReadStream } from "@/src/helpers/ai-stream-transport";
import { AiProfiles, AI_CAPS, AI_CAP_BITS } from "@/src/helpers/ai-profiles";
import { AiSettings } from "@/src/helpers/ai-settings";
import { AiTools } from "@/src/helpers/ai-tools";
import { agentStorageFolderId } from "@/src/helpers/device-upload";
import {
  listFolderFiles,
  waitForExportedFile,
} from "@/src/helpers/text-to-docx";
import { UserType, ApiSDK } from "@/src/services/api-sdk";

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

  test("POST /api/2.0/ai/ai/send-with-stream - a second thread of the same agent does not inherit the first one's context", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The negative half of the test above: "the thread remembers" is only a
    // *per-thread* history if the thread next to it does not. A backend that
    // keyed the conversation on the agent, or on the user, would pass the
    // continuation test and fail this one.
    //
    // Three inference turns, so the default 240s test timeout is not enough.
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Chat Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const first = await aiChat.createThreadId("owner", {
      title: "Autotest thread that knows the word",
      profileId,
      agentId,
    });
    const second = await aiChat.createThreadId("owner", {
      title: "Autotest thread that must not",
      profileId,
      agentId,
    });

    const taught = await aiChat.sendMessage("owner", {
      threadId: first,
      profileId,
      agentId,
      message: "Remember the code word ORANGE. Reply with just: OK.",
    });
    expect(taught.status).toBe(200);
    expect(taught.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReplies("owner", first, 1, 120000),
    );

    // The same question, in the sibling thread. The instruction to answer NONE
    // keeps a model that does not know from filling the gap with a guess, and
    // the health check keeps a *failed* reply from being read as "it did not
    // know".
    const asked = await aiChat.sendMessage("owner", {
      threadId: second,
      profileId,
      agentId,
      message:
        "What code word did I ask you to remember earlier in this conversation? If no code word was ever mentioned here, reply with just: NONE.",
    });
    expect(asked.status).toBe(200);
    expect(asked.streamError).toBeUndefined();
    const secondThread = await aiChat.waitForAssistantReplies(
      "owner",
      second,
      1,
      120000,
    );
    expectHealthyAssistantReply(secondThread);

    // Neither the answer nor anything stored in the second thread carries the
    // first thread's word or its question.
    expect(
      secondThread
        .map((message) => AiAgentChat.messageText(message))
        .join("\n")
        .toUpperCase(),
      "the sibling thread neither holds nor repeats the other thread's word",
    ).not.toContain("ORANGE");
    expect(AiAgentChat.userMessages(secondThread)).toHaveLength(1);

    // And the first thread still knows it — otherwise the miss above could just
    // be a model that had dropped the word by then, in either thread.
    const reasked = await aiChat.sendMessage("owner", {
      threadId: first,
      profileId,
      agentId,
      message:
        "What code word did I ask you to remember? Reply with just that word.",
    });
    expect(reasked.status).toBe(200);
    expect(reasked.streamError).toBeUndefined();
    const firstThread = await aiChat.waitForAssistantReplies(
      "owner",
      first,
      2,
      120000,
    );
    expectHealthyAssistantReply(firstThread, 2);
    expect(
      AiAgentChat.messageText(
        AiAgentChat.assistantMessages(firstThread)[1],
      ).toUpperCase(),
    ).toContain("ORANGE");

    // The first thread's own transcript stayed its own too: its two questions,
    // and not the sibling's.
    expect(
      AiAgentChat.userMessages(firstThread).map((message) =>
        AiAgentChat.messageText(message),
      ),
    ).toEqual([
      "Remember the code word ORANGE. Reply with just: OK.",
      "What code word did I ask you to remember? Reply with just that word.",
    ]);
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

// Every model the payments "AI models" page lists (Off/On column) is supposed
// to be usable: switched on by default, and — for anything that is a chat
// model at all — able to actually answer. This is the whole catalogue, not one
// representative per capability class the way the tests above pick.
//
// Image-generation-only profiles (capabilities === AI_CAPS.imageOnly, e.g. the
// "Nano Banana" / image models) are deliberately left out of the chat loop
// below: driving one directly as a chat model is refused with
// `code:"model_not_found"`, and the only in-product path to an image model — a
// chat model calling the built-in `generate_image` tool — never resolves
// (BUG 82861, see the "AI Chat - image generation" describe further down). Both
// are already pinned elsewhere; repeating a two-minute hang for every image
// profile here would not add coverage. They are still covered by the "on"
// check, since that reads the whole catalogue.
test.describe("AI Chat - every catalogue model is alive", () => {
  test("every AI model is switched on, and every chat-capable one answers a real question", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(600000);

    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");

    // "Off/On" on the payments page is the restricted-models list turned
    // inside out: a model is on exactly when it is absent from it. A fresh
    // portal ships with nothing restricted, so every catalogue model must
    // start there.
    const { status: restrictedStatus, data: restricted } =
      await ownerApi.payment.getRestrictedAiModels();
    expect(restrictedStatus).toBe(200);
    const restrictedIds = new Set(restricted.response?.models ?? []);
    const restrictedFromCatalogue = catalogue
      .map((profile) => profile.modelId)
      .filter((modelId) => restrictedIds.has(modelId));
    expect(
      restrictedFromCatalogue,
      "every catalogue model is on by default",
    ).toEqual([]);

    const chatCapable = catalogue.filter(
      (profile) =>
        ((profile.capabilities ?? 0) & AI_CAP_BITS.text) === AI_CAP_BITS.text,
    );
    expect(
      chatCapable.length,
      "the catalogue offers at least one chat-capable model",
    ).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const profile of chatCapable) {
      try {
        const agentId = await aiChat.createAgentId("owner", {
          title: `Autotest liveness agent — ${profile.modelId}`,
          profileId: profile.id,
          prompt: SHORT_ANSWER_PROMPT,
        });
        const threadId = await aiChat.createThreadId("owner", {
          title: `liveness — ${profile.modelId}`,
          profileId: profile.id,
          agentId,
        });

        const question = "What is 2+2? Answer in one word.";
        const { status, streamError } = await aiChat.sendMessage("owner", {
          threadId,
          profileId: profile.id,
          agentId,
          message: question,
        });
        if (streamError !== undefined) {
          throw new Error(`stream error: ${streamError}`);
        }
        if (status !== 200) {
          throw new Error(`send-with-stream answered ${status}`);
        }

        const messages = await aiChat.waitForAssistantReply("owner", threadId);
        expectHealthyAssistantReply(messages);
      } catch (err) {
        failures.push(
          `${profile.name} (${profile.modelId}): ${(err as Error).message}`,
        );
      }
    }

    // Collected rather than thrown as soon as the first model fails, so one
    // dead model does not hide every other model's result in the same run.
    expect(failures, "models that did not answer in chat").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// "The answer appears as it is generated" — the API half of it.
//
// Two tests, because the claim has two halves that no single one can carry:
//
//   1. the contract of the stream: which frames, in which order, tied to which
//      message, and whether what the client assembles from them is what the
//      thread ends up holding. Asserted on the buffered body, which is all a
//      frame contract needs.
//   2. the transport: that the body really arrives in pieces while the model is
//      writing. A buffered client cannot tell that apart from one blob at the
//      end, so that one goes through Node's client and looks at arrival times.
//
// The protocol, as it answers today:
//
//   {"type":"user-message-stored","message":{role:"user",…,"id":U},"messageId":U}
//   {"type":"message-start","message":{role:"assistant","content":[…],"id":A},"messageId":A}
//   {"type":"message-delta",…}      // zero or more
//   {"type":"message-end","message":{…,"id":A},"messageId":A}
//
// Two details shape every assertion below:
//
//   * `messageId` is NOT constant across the stream. The first frame carries the
//     id of the stored *user* message; every frame after it carries the
//     assistant's. Asserting one id for the whole stream would be asserting a
//     bug.
//   * a `message-delta` is a cumulative snapshot of the whole reply, not the
//     fragment that was added, and `message-start` already carries the first
//     tokens. So the assembled text is the LAST frame's, the snapshots grow as a
//     chain of prefixes, and concatenating them would be wrong.
//
// Not covered here on purpose: the tool-call pause (`tool-call-pending`, in the
// MCP suite), the failed-reply terminal (`message-incomplete`, in the image
// block below) and the OpenAI-shaped variant of this route (messages.spec.ts).

/** Long enough that the model needs several turns of the socket to say it. */
const LONG_ANSWER_QUESTION =
  "Count from 1 to 60, separated by commas. Output nothing else.";

test.describe("AI Chat - the stream of one reply", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - the reply is streamed as NDJSON frames that match the stored message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Stream Contract Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest stream thread",
      profileId,
      agentId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: LONG_ANSWER_QUESTION,
    });

    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    // A streamed response, declared as one: NDJSON, and no Content-Length —
    // a length header would mean the whole body was known before it was sent.
    expect(sent.headers["content-type"]).toContain("application/x-ndjson");
    expect(
      sent.headers["content-length"],
      "a streamed body cannot announce its length up front",
    ).toBeUndefined();

    const frames = AiAgentChat.streamFrames(sent.text);
    const types = frames.map((frame) => frame.type);
    const where = `frames were ${types.join(", ")}`;

    // The question is acknowledged first, before the model is asked anything —
    // this is the frame a client renders the user's own bubble from.
    expect(types[0], where).toBe("user-message-stored");
    const userFrame = frames[0];
    expect(AiAgentChat.frameText(userFrame)).toBe(LONG_ANSWER_QUESTION);

    // Then the reply opens, finishes, and does so in that order.
    const startIndex = types.indexOf("message-start");
    const endIndex = types.indexOf("message-end");
    expect(startIndex, where).toBeGreaterThan(0);
    expect(endIndex, where).toBeGreaterThan(startIndex);
    expect(
      types.filter((type) => type === "message-start"),
      "one reply, one opening frame",
    ).toHaveLength(1);
    expect(
      types.filter((type) => type === "message-end"),
      "one reply, one terminal frame",
    ).toHaveLength(1);

    // A healthy reply never carries the failure terminal.
    expect(types, where).not.toContain("message-incomplete");
    expect(types, where).not.toContain("tool-call-pending");

    // The answer arrives in pieces rather than in one frame at the end.
    const deltas = types
      .slice(startIndex + 1, endIndex)
      .filter((type) => type === "message-delta");
    expect(
      deltas.length,
      `no content frame between start and end; ${where}`,
    ).toBeGreaterThan(0);

    // Nothing carrying reply content follows the terminal frame.
    const afterEnd = types.slice(endIndex + 1);
    for (const type of afterEnd) {
      expect(
        AiAgentChat.CONTENT_FRAME_TYPES,
        `${type} arrived after message-end; ${where}`,
      ).not.toContain(type);
    }

    // Every frame after the acknowledgement belongs to one assistant message —
    // the first frame is deliberately excluded, it identifies the question.
    const streamedMessageId = frames[startIndex].messageId;
    expect(streamedMessageId).toBeTruthy();
    for (const frame of frames.slice(1)) {
      expect(frame.messageId, `${frame.type} names another message`).toBe(
        streamedMessageId,
      );
      if (frame.message?.id !== undefined) {
        expect(frame.message.id).toBe(streamedMessageId);
      }
      // `threadId` is optional on this protocol — only the pause frame carries
      // one today — so it is checked where it exists rather than required.
      if (frame.threadId !== undefined) {
        expect(frame.threadId).toBe(threadId);
      }
    }

    // The snapshots grow: each one extends the one before it.
    const snapshots = AiAgentChat.deltaTexts(sent.text);
    for (let index = 1; index < snapshots.length; index += 1) {
      expect(
        snapshots[index].startsWith(snapshots[index - 1]),
        `snapshot ${index} is not an extension of the one before it: "${snapshots[index - 1].slice(-40)}" -> "${snapshots[index].slice(-40)}"`,
      ).toBe(true);
    }

    // What the client assembled is what the thread kept.
    const stored = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(stored);

    const asked = AiAgentChat.userMessages(stored);
    expect(asked, "the question is stored once").toHaveLength(1);
    expect(asked[0].id).toBe(userFrame.messageId);

    const replies = AiAgentChat.assistantMessages(stored);
    expect(replies, "the reply is stored once").toHaveLength(1);
    expect(replies[0].id).toBe(streamedMessageId);
    expect(AiAgentChat.messageText(replies[0])).toBe(
      AiAgentChat.streamedText(sent.text),
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - the body is delivered in pieces while the model is still writing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The transport claim, and the only test in the suite that can make it:
    // everything else reads a body Playwright already collected in full.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Stream Transport Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest transport thread",
      profileId,
      agentId,
    });

    const streamed = await postAndReadStream(
      `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/ai/ai/send-with-stream`,
      {
        headers: {
          Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
          Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
        },
        body: {
          threadId,
          entityId: String(agentId),
          profileId,
          userMessage: {
            role: "user",
            content: [{ type: "text", text: LONG_ANSWER_QUESTION }],
          },
        },
      },
    );

    expect(streamed.status).toBe(200);
    expect(streamed.headers["content-type"]).toContain("application/x-ndjson");

    const trace = streamed.reads
      .map((read) => `${read.atMs}ms:${AiAgentChat.frameTypes(read.text)}`)
      .join(" | ");

    // The body was not one blob: the client got it over several reads, the
    // first of them after the response was already open.
    expect(
      streamed.reads.length,
      `the whole body arrived in a single read (${trace})`,
    ).toBeGreaterThan(1);
    expect(
      streamed.responseAtMs,
      `the body cannot predate its own headers (${trace})`,
    ).toBeLessThanOrEqual(streamed.reads[0].atMs);

    // And those reads span the generation: the first frame is in the client's
    // hands well before the reply is finished, which is what lets a UI render a
    // partial answer and drop its "Analyzing" indicator.
    const firstFrameRead = streamed.reads.findIndex(
      (read) => AiAgentChat.streamFrames(read.text).length > 0,
    );
    const terminalRead = streamed.reads.findIndex((read) =>
      AiAgentChat.frameTypes(read.text).includes("message-end"),
    );
    expect(
      firstFrameRead,
      `no frame arrived at all (${trace})`,
    ).toBeGreaterThan(-1);
    expect(terminalRead, `the reply never finished (${trace})`).toBeGreaterThan(
      -1,
    );
    expect(
      firstFrameRead,
      `the first frame and the terminal one arrived in the same read (${trace})`,
    ).toBeLessThan(terminalRead);
    expect(
      streamed.reads[firstFrameRead].atMs,
      `the first frame did not arrive before the last (${trace})`,
    ).toBeLessThan(streamed.reads[terminalRead].atMs);

    // The reassembled body is the same stream the buffered client sees, and it
    // agrees with what was stored.
    expect(AiAgentChat.streamError(streamed.body)).toBeUndefined();
    const stored = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(stored);
    expect(
      AiAgentChat.messageText(AiAgentChat.assistantMessages(stored)[0]),
    ).toBe(AiAgentChat.streamedText(streamed.body));
  });
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

test.describe("Thread management - a member manages their own thread", () => {
  // The isolation matrix in chat.permission.spec.ts only establishes that a
  // member is refused on *someone else's* thread. A backend that treated threads
  // as the owner's property — only the portal owner may rename, clear or delete
  // one — would pass that matrix while leaving the chat menu of every other
  // member dead, so the positive half is pinned here for each role that can be a
  // real member of an agent.
  for (const { label, type, role } of MEMBER_ROLES) {
    test(`PUT /api/2.0/ai/threads/rename, DELETE /api/2.0/ai/threads/clear-messages, DELETE /api/2.0/ai/threads/delete - ${label} manages their own thread`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profileId = await aiChat.defaultProfileId("owner");
      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Member Thread Agent",
        profileId,
      });

      // All owner-side work first: the shared request context's session cookie
      // outranks the bearer token, so from here on every call is the member's.
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
      // The control for every read below: whatever happens to the thread under
      // test, this one has to stay listed, titled and readable.
      const sibling = await aiChat.createThreadId(role, {
        title: "Member sibling thread",
        profileId,
        agentId,
      });

      await test.step("renames it", async () => {
        const { data, status } = await aiChat.renameThread(
          role,
          threadId,
          "Renamed by the member",
        );

        const after = await aiChat.getThread(role, threadId);
        expect(after.status).toBe(200);
        expect(after.data?.title).toBe("Renamed by the member");
        expect(
          (await aiChat.getThread(role, sibling)).data?.title,
          "the rename hit one thread, not the member's whole list",
        ).toBe("Member sibling thread");
        expect(data?.success).toBe(true);
        expect(status).toBe(200);
      });

      await test.step("clears its history and keeps the thread", async () => {
        const appended = await aiChat.appendUserMessage(role, {
          threadId,
          profileId,
          text: "A message of my own",
        });
        expect(appended.status).toBe(200);
        expect((await aiChat.readMessages(role, threadId)).data).toHaveLength(
          1,
        );

        const { data, status } = await aiChat.clearThreadMessages(
          role,
          threadId,
        );

        const messages = await aiChat.readMessages(role, threadId);
        expect(messages.status).toBe(200);
        expect(messages.data).toEqual([]);
        // The thread itself survives, under the name the member gave it.
        const thread = await aiChat.getThread(role, threadId);
        expect(thread.status).toBe(200);
        expect(thread.data?.title).toBe("Renamed by the member");
        expect(data?.success).toBe(true);
        expect(status).toBe(200);
      });

      await test.step("deletes it", async () => {
        const { data, status } = await aiChat.deleteThread(role, threadId);

        const listed = await aiChat.listThreads(role, agentId);
        expect(listed.status).toBe(200);
        const ids = listed.data.map((thread) => thread.threadId);
        expect(ids).not.toContain(threadId);
        // Positive control: the list is not empty because the read failed.
        expect(ids).toEqual([sibling]);
        expect(data?.success).toBe(true);
        expect(status).toBe(200);
      });
    });
  }
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

  test("POST /api/2.0/ai/threads/open-or-create - a thread that holds a conversation is replayed whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The positive control for the empty thread above, and the API side of
    // "reopening a chat brings its history back". `priorMessages: []` on a
    // thread that never held anything would also pass on a route that always
    // answers with an empty array, so the replay is only proven by a thread
    // that has something to replay.
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
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread with a history",
      profileId: profile.id,
      agentId,
    });

    // One real turn, so the history carries both roles — a replay that only
    // kept the user's side would still satisfy a length check.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: profile.id,
      agentId,
      message: "Reply with the single word ORANGE and nothing else.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    // Plus a question stored without an answer, so the transcript is not a
    // sequence of complete pairs that a replay could reconstruct by shape.
    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId: profile.id,
      text: "Autotest unanswered question",
    });
    expect(appended.status).toBe(200);

    const stored = await aiChat.readMessages("owner", threadId);
    expect(stored.status).toBe(200);
    expect(stored.data).toHaveLength(3);

    const { status, data } = await aiChat.openOrCreateThread("owner", {
      threadId,
      profile,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });

    expect(status).toBe(200);
    expect(data?.threadId, "the existing thread is reused").toBe(threadId);

    // What comes back is the stored transcript itself: same messages, same
    // order, same ids — not a summary and not the last turn only.
    const replayed = (data?.priorMessages ?? []) as AiThreadMessage[];
    expect(replayed).toHaveLength(3);
    expect(replayed.map((message) => message.id)).toEqual(
      stored.data.map((message) => message.id),
    );
    expect(replayed.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
    ]);
    expect(replayed.map((message) => AiAgentChat.messageText(message))).toEqual(
      stored.data.map((message) => AiAgentChat.messageText(message)),
    );
    expect(
      AiAgentChat.messageText(replayed[1]).toUpperCase(),
      "the assistant's answer is part of the replay",
    ).toContain("ORANGE");

    // Opening a thread that already exists still does not store its
    // `firstMessage`, and does not start a second thread.
    const after = await aiChat.readMessages("owner", threadId);
    expect(after.data.map((message) => message.id)).toEqual(
      stored.data.map((message) => message.id),
    );
    const listedAfter = await aiChat.listThreads("owner", agentId);
    expect(listedAfter.data.map((thread) => thread.threadId)).toEqual([
      threadId,
    ]);
  });

  test("POST /api/2.0/ai/threads/open-or-create - the whole profile object is required, not just its id", async ({
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

    // The SDK types make the whole `AiProfile` object a required field, and the
    // route agrees: `profileId` alone used to bind on the open path and no
    // longer does. Worth pinning, because it is what tells the 500 in the create
    // case below apart from a body the validator never accepted.
    const short = await aiChat.openOrCreateThread("owner", {
      threadId,
      profileId: profile.id,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });
    expect(short.status, "profileId on its own").toBe(404);
    expect(short.error).toBe(
      "an AI profile is required to open or create a thread",
    );

    const { status, data } = await aiChat.openOrCreateThread("owner", {
      threadId,
      profile,
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

  test("POST /api/2.0/ai/threads/open-or-create - opening a thread with another profile leaves its model alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The open call carries a whole profile object of its own (the test above),
    // so "the thread's model comes back when the thread is opened" only holds if
    // that object is the client's *default* pick and not a write. A composer
    // that opens every thread with whatever the picker last showed would
    // otherwise retag conversations just by looking at them — and since the
    // reply is not marked with the model that produced it, nothing downstream
    // would show it.
    //
    // A room, not an agent: picking a model per thread is only the user's to do
    // outside an agent — inside one it is BUG 82915, not the feature.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread on the first model",
      profileId: first.id,
      agentId: roomId,
    });

    const opened = await aiChat.openOrCreateThread("owner", {
      threadId,
      profile: second,
      entityId: String(roomId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });
    expect(opened.status).toBe(200);
    expect(opened.data?.threadId, "the existing thread is reused").toBe(
      threadId,
    );

    const reopened = await aiChat.getThread("owner", threadId);
    expect(reopened.status).toBe(200);
    expect(
      reopened.data?.profileId,
      "the thread keeps the model it was created with",
    ).toBe(first.id);

    const listed = await aiChat.listThreads("owner", roomId);
    expect(
      listed.data.find((thread) => thread.threadId === threadId)?.profileId,
      "and the list the picker is drawn from was not retagged either",
    ).toBe(first.id);

    // Positive control. "The model did not move" would also be what a store that
    // ignores every write looks like, so the documented way of moving it — a
    // send carrying the other profile — has to move it, on this very thread and
    // right after the open.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: second.id,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    await aiChat.waitForAssistantReply("owner", threadId);

    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "a send does move it",
    ).toBe(second.id);
  });

  test("POST /api/2.0/ai/threads/open-or-create, GET read-messages - a long history is replayed whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The replay above is three messages long, which says nothing about a thread
    // with a real conversation in it. Nothing here pages: `count` and `cursor`
    // are accepted and ignored by both read-messages (BUG 82899) and list (BUG
    // 82825), so a server-side cap would not truncate the history into a first
    // page the client can ask past — it would drop the rest for good.
    //
    // Built with append-user-message: forty stored messages and no inference, so
    // the length under test is the store's, not the model's.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profile = AiAgentChat.pickTextProfile(
      await aiChat.listProfiles("owner"),
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId: profile.id,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread with a long history",
      profileId: profile.id,
      agentId,
    });

    const HISTORY_LENGTH = 40;
    const texts = Array.from(
      { length: HISTORY_LENGTH },
      (_unused, index) => `Autotest history message ${index + 1}`,
    );
    for (const text of texts) {
      const appended = await aiChat.appendUserMessage("owner", {
        threadId,
        profileId: profile.id,
        text,
      });
      expect(appended.status, `storing "${text}"`).toBe(200);
    }

    const stored = await aiChat.readMessages("owner", threadId);
    expect(stored.status).toBe(200);
    expect(
      stored.data.map((message) => AiAgentChat.messageText(message)),
      "read-messages returns the whole thread, in order",
    ).toEqual(texts);

    const { status, data } = await aiChat.openOrCreateThread("owner", {
      threadId,
      profile,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });

    expect(status).toBe(200);
    expect(data?.threadId).toBe(threadId);

    // Compared as a whole list rather than by length: a cap that kept the newest
    // messages and a cap that kept the oldest are both truncation, and both have
    // to fail here.
    const replayed = (data?.priorMessages ?? []) as AiThreadMessage[];
    expect(
      replayed.map((message) => AiAgentChat.messageText(message)),
      "opening replays the whole thread, in order",
    ).toEqual(texts);
    expect(replayed.map((message) => message.id)).toEqual(
      stored.data.map((message) => message.id),
    );
  });

  test("POST /api/2.0/ai/threads/open-or-create - a replayed message keeps its attachments", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Everything the replay is asserted on so far is text. A user message can
    // also carry attachments — send-with-stream stores them on the message
    // (attachments.spec.ts) — and a client that draws the paperclips from the
    // replay needs them to survive it, whatever the model did or did not do with
    // them (it does nothing: BUG 82773).
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const profile = AiAgentChat.pickTextProfile(
      await aiChat.listProfiles("owner"),
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threads Agent",
      profileId: profile.id,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread with an attachment",
      profileId: profile.id,
      agentId,
    });

    const attachmentId = await attachments.saveFileId(
      "owner",
      {
        title: "Autotest replayed.docx",
        content: "replayed payload",
        type: FileType.Document,
      },
      String(agentId),
    );

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId: profile.id,
      agentId,
      message: "Reply with the single word OK.",
      attachments: [{ id: attachmentId }],
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    const stored = await aiChat.readMessages("owner", threadId);
    const storedQuestion = AiAgentChat.userMessages(stored.data)[0];
    expect(
      storedQuestion.attachments,
      "the attachment is on the stored message",
    ).toEqual([{ id: attachmentId }]);

    const { status, data } = await aiChat.openOrCreateThread("owner", {
      threadId,
      profile,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });
    expect(status).toBe(200);

    const replayed = (data?.priorMessages ?? []) as AiThreadMessage[];
    const replayedQuestion = AiAgentChat.userMessages(replayed)[0];
    expect(replayedQuestion?.id).toBe(storedQuestion.id);
    expect(
      replayedQuestion?.attachments,
      "and it comes back with the replay",
    ).toEqual([{ id: attachmentId }]);
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

    // The full profile object the SDK types ask for is the shape the route
    // accepts, and it crashes. The `profileId` a caller would try next does not
    // even get that far — the body validator wants a `profile` object.
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
    expect(withProfileId.status).toBe(400);
    expect(withProfileId.error).toBe(
      "threadId (string) and profile (object) are required",
    );

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
// "A thread is started by its first message, and named after it."
//
// The product rule is two halves: a thread appears only once the user has sent
// something — an empty one is never kept — and its title is generated from that
// first question rather than typed by the user.
//
// Measured 2026-08-12, the API implements the first half and not the second:
//
//   * `POST /ai/ai/send-with-stream` with NO `threadId` (or an empty one) opens
//     the thread itself and answers the message in the same call. The very
//     first frame of the stream is a `thread-title` frame carrying the new
//     threadId — that is how the client learns which thread it is now in. So
//     nothing has to create an empty thread up front, and `open-or-create`
//     being 500 without a threadId (BUG 82826, above) is not what blocks the
//     rule.
//   * `POST /ai/threads/create` is the "I typed a name" route: `title` is
//     required and must not be blank, and a thread made that way is persisted
//     with no message in it and never pruned. It is the client's own business
//     not to call it.
//   * The generated title does not exist. Every thread the first message opens
//     is called `New chat`, and no later turn changes that — the `thread-title`
//     frame carries the same fixed string, and the only route that asks the
//     model for a title is 500 (BUG 82828, above).

/** Raw thread/send calls — the typed helpers always fill `title`/`threadId` in. */
class RawThreadCalls extends AiHttp {
  post(role: AgentRole, path: string, body: unknown) {
    return this.call<{ threadId?: string }>(role, "post", path, body);
  }

  /** For the bodies the typed helpers cannot express — a missing or null field. */
  put(role: AgentRole, path: string, body: unknown) {
    return this.call<{ success?: boolean }>(role, "put", path, body);
  }

  del(role: AgentRole, path: string, body: unknown) {
    return this.call<{ success?: boolean }>(role, "delete", path, body);
  }
}

const AUTO_TITLE_QUESTION =
  "What is the capital of France? Answer in one word.";

/** What the backend names every thread a first message opens. */
const DEFAULT_THREAD_TITLE = "New chat";

/**
 * The real title is generated and swapped in after the stream — by design,
 * per the DocSpace team: waiting for it before returning the reply would
 * make every first message noticeably slower. Poll instead of reading once.
 */
async function waitForRenamedThread(
  aiChat: AiAgentChat,
  threadId: string,
  timeoutMs = 30000,
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const title = (await aiChat.getThread("owner", threadId)).data?.title;
    if (title !== DEFAULT_THREAD_TITLE || Date.now() > deadline)
      return title ?? undefined;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

test.describe("AI Threads - started by the first message", () => {
  test("POST /api/2.0/ai/threads/create - a thread with no message in it is kept and listed", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Empty Thread Agent",
      profileId,
    });

    const emptyThreadId = await aiChat.createThreadId("owner", {
      title: "Autotest never used",
      profileId,
      agentId,
    });

    // Nothing was ever sent into it...
    const messages = await aiChat.readMessages("owner", emptyThreadId);
    expect(messages.status).toBe(200);
    expect(messages.data, "the thread really is empty").toEqual([]);

    // ...and it is a first-class thread all the same: readable, and listed next
    // to a thread that does carry a message. The used thread is the control —
    // it proves the list is being read, so "the empty one is still here" is not
    // an artefact of a list that answers with everything or with nothing.
    const usedThreadId = await aiChat.createThreadId("owner", {
      title: "Autotest used",
      profileId,
      agentId,
    });
    const appended = await aiChat.appendUserMessage("owner", {
      threadId: usedThreadId,
      profileId,
      text: "hello",
    });
    expect(appended.status).toBe(200);
    expect(
      (await aiChat.readMessages("owner", usedThreadId)).data,
    ).toHaveLength(1);

    const read = await aiChat.getThread("owner", emptyThreadId);
    expect(read.status).toBe(200);
    expect(read.data?.threadId).toBe(emptyThreadId);
    expect(read.data?.title).toBe("Autotest never used");

    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(
      listed.data.map((thread) => thread.threadId).sort(),
      "the unused thread was not pruned when a used one appeared",
    ).toEqual([emptyThreadId, usedThreadId].sort());
  });

  test("POST /api/2.0/ai/threads/create - a blank title is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `create` never names a thread for the caller: every spelling of "you pick
    // one" is a 400. Worth pinning next to the generation test below — an
    // untitled thread is not a state the API can even be put in, so a client
    // that wants the backend to name the thread has to use the send path.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const raw = new RawThreadCalls(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Untitled Thread Agent",
      profileId,
    });

    const blankTitles: Array<[string, Record<string, unknown>]> = [
      ["no title field", {}],
      ["an empty title", { title: "" }],
      ["a null title", { title: null }],
      ["a whitespace title", { title: "   " }],
    ];

    for (const [label, titleField] of blankTitles) {
      const { status, error } = await raw.post(
        "owner",
        "/api/2.0/ai/threads/create",
        { ...titleField, profileId, entityId: String(agentId) },
      );
      expect(status, `create with ${label}`).toBe(400);
      expect(error, `create with ${label}`).toBe("Bad Request");
    }

    // The refusals left nothing behind, and the list is being read: a titled
    // create is the only thread in it.
    const titledId = await aiChat.createThreadId("owner", {
      title: "Autotest titled",
      profileId,
      agentId,
    });
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toEqual([titledId]);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a send with no threadId opens the thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const raw = new RawThreadCalls(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Threadless Send Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // Nothing exists yet — the thread this send is about to open cannot be one
    // the agent already had.
    const before = await aiChat.listThreads("owner", agentId);
    expect(before.status).toBe(200);
    expect(before.data, "the agent starts with no threads").toEqual([]);

    const sent = await raw.post("owner", "/api/2.0/ai/ai/send-with-stream", {
      entityId: String(agentId),
      profileId,
      userMessage: {
        role: "user",
        content: [{ type: "text", text: AUTO_TITLE_QUESTION }],
      },
    });
    expect(sent.status).toBe(200);
    expect(AiAgentChat.streamError(sent.text)).toBeUndefined();

    // The new thread is announced in the opening frame, before the question is
    // acknowledged — this is where the client picks up the id it did not have.
    const frames = AiAgentChat.streamFrames(sent.text);
    const types = frames.map((frame) => frame.type);
    const where = `frames were ${types.join(", ")}`;
    expect(types[0], where).toBe("thread-title");
    expect(types.indexOf("user-message-stored"), where).toBe(1);

    const threadId = frames[0].threadId;
    expect(threadId, "the opening frame names the new thread").toBeTruthy();
    expect(frames[0].profileId).toBe(profileId);

    // It is a real, listed thread of that agent, carrying the question and an
    // answer the model actually produced.
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toEqual([threadId]);

    const messages = await aiChat.waitForAssistantReply(
      "owner",
      threadId as string,
    );
    const asked = AiAgentChat.userMessages(messages);
    expect(
      asked,
      "the question opened the thread and is stored once",
    ).toHaveLength(1);
    expect(AiAgentChat.messageText(asked[0])).toBe(AUTO_TITLE_QUESTION);
    expectHealthyAssistantReply(messages);

    // An empty threadId is the same call, not a validation error: it opens a
    // second thread rather than reusing the first.
    const emptyId = await raw.post("owner", "/api/2.0/ai/ai/send-with-stream", {
      threadId: "",
      entityId: String(agentId),
      profileId,
      userMessage: {
        role: "user",
        content: [{ type: "text", text: "Say OK." }],
      },
    });
    expect(emptyId.status).toBe(200);
    expect(AiAgentChat.streamError(emptyId.text)).toBeUndefined();

    const secondFrames = AiAgentChat.streamFrames(emptyId.text);
    expect(secondFrames[0].type).toBe("thread-title");
    const secondThreadId = secondFrames[0].threadId;
    expect(secondThreadId).toBeTruthy();
    expect(secondThreadId, 'threadId "" is not the first thread').not.toBe(
      threadId,
    );

    const bothListed = await aiChat.listThreads("owner", agentId);
    expect(bothListed.data.map((thread) => thread.threadId).sort()).toEqual(
      [threadId, secondThreadId].sort(),
    );
  });

  test('POST /api/2.0/ai/ai/send-with-stream - the thread the first question opened is renamed from "New chat"', async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const raw = new RawThreadCalls(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Auto Title Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // A distinctive question with an obvious short answer, so a title built
    // from it would be recognisable and a title that ignores it cannot be
    // mistaken for a bad summary.
    const sent = await raw.post("owner", "/api/2.0/ai/ai/send-with-stream", {
      entityId: String(agentId),
      profileId,
      userMessage: {
        role: "user",
        content: [{ type: "text", text: AUTO_TITLE_QUESTION }],
      },
    });
    expect(sent.status).toBe(200);

    const frames = AiAgentChat.streamFrames(sent.text);
    expect(frames[0].type).toBe("thread-title");
    const threadId = frames[0].threadId as string;
    expect(threadId).toBeTruthy();

    // The title the stream announces is the fixed default...
    expect(frames[0].title, "the title carried by the opening frame").toBe(
      DEFAULT_THREAD_TITLE,
    );

    // ...on a thread the model really answered, so the naming cannot be blamed
    // on there being nothing to build a title from.
    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);

    // The real title is generated off the reply and swapped in afterwards, not
    // waited for before the stream returns — that's why the opening frame
    // above still carries the default. Poll for the rename instead of reading
    // once.
    const renamedTitle = await waitForRenamedThread(aiChat, threadId);
    expect(
      renamedTitle,
      "the first question renames the thread away from the default",
    ).not.toBe(DEFAULT_THREAD_TITLE);
    expect(
      (await aiChat.listThreads("owner", agentId)).data.find(
        (thread) => thread.threadId === threadId,
      )?.title,
      "get-by-id and list agree",
    ).toBe(renamedTitle);

    // A second turn does not name it either, and carries no title frame at all:
    // there is no "the title catches up once the conversation has substance".
    const second = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "And the capital of Italy? One word.",
    });
    expect(second.status).toBe(200);
    expect(
      second.frames.map((frame) => frame.type),
      "no title frame on a later turn",
    ).not.toContain("thread-title");
    await aiChat.waitForAssistantReplies("owner", threadId, 2, 120000);

    const afterSecond = await aiChat.getThread("owner", threadId);
    expect(afterSecond.status).toBe(200);

    // Confirms the earlier rename stuck rather than being reverted or redone.
    expect(afterSecond.data?.title).toBe(renamedTitle);
  });
});

// ---------------------------------------------------------------------------
// The global entry point: AI Chat opened from the portal's own interface.
//
// Requirement ("Common for portal"): after the Article/Section rework the main
// section carries a button that opens AI Chat. The button itself is not an API
// object, but the composer behind it is a measurable state — it is not looking at
// an agent, a room or a folder, so its calls carry no `entityId` at all:
//
//   POST /ai/threads/create        { title, profileId }                 (no entityId)
//   POST /ai/ai/send-with-stream   { threadId, profileId, userMessage }  (no entityId)
//   GET  /ai/threads/list                                               (no entityId)
//
// Whether the button is drawn is decided by three switches, each covered in its
// own suite: the portal one (GET|PUT /settings/ai-access, settings/common), the
// portal readiness in GET /ai/config -> aiReady and the per-user tumbler
// GET|PUT /ai/config/user (ai/settings), plus the whole AI-off route matrix in
// chat.ai-disabled.spec.ts. What is left for here is the chat behind the button:
// that an entity-less thread can be started and answered, that every user type
// which sees the main section can do it, and that the history stays with whoever
// wrote it.
//
// The scoping half of it is confirmed by design (BUG 82855, dev response
// 2026-08-24: "chat is isolated inside agents; outside an agent it shares one
// context across every other entity"): no entity resolves to the same shared
// bucket as every room and folder, so the global chat's history is also what a
// room's chat panel shows. That direction is asserted at the end of this block.

const GLOBAL_CHAT_TITLE = "Autotest global chat";

// A Guest is deliberately not in this matrix, and for a different reason than in
// the agent tests above: there it is room membership that stops them, here the
// route itself refuses — measured 403 on 2026-08-19, in line with the rest of the
// AI surface (deep mode is 403 for a Guest across the board, and so is saving a
// chat attachment). That refusal has its own test at the end of the block.
const GLOBAL_CHAT_ROLES = MEMBER_ROLES;

test.describe("AI Chat - the global entry point", () => {
  test("POST /api/2.0/ai/threads/create, POST /api/2.0/ai/ai/send-with-stream - Owner chats with no entity at all", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    // No agent, no room, no folder — the body the header button sends.
    const { status, threadId } = await aiChat.createThread("owner", {
      title: GLOBAL_CHAT_TITLE,
      profileId,
    });
    expect(status).toBe(200);
    expect(threadId).toBeTruthy();

    const read = await aiChat.getThread("owner", threadId);
    expect(read.status).toBe(200);
    expect(read.data?.threadId).toBe(threadId);
    expect(read.data?.title).toBe(GLOBAL_CHAT_TITLE);
    // The model the composer picked is stored on the thread without a scope too.
    expect(read.data?.profileId).toBe(profileId);

    // A record is not a chat: the thread has to answer.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    // And the panel the button opens lists what it just wrote.
    const listed = await aiChat.listThreads("owner");
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);
  });

  for (const { label, type, role } of GLOBAL_CHAT_ROLES) {
    test(`POST /api/2.0/ai/threads/create, POST /api/2.0/ai/ai/send-with-stream - ${label} chats from the global entry point`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      // Read as the Owner while the shared context still is the Owner.
      const profileId = await aiChat.defaultProfileId("owner");

      const { data: memberData } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );
      await aiChat.expectActingAs(role, memberData.response!.id!, label);

      const { status, threadId } = await aiChat.createThread(role, {
        title: GLOBAL_CHAT_TITLE,
        profileId,
      });
      expect(status, `${label} starts a thread with no entity`).toBe(200);
      expect(threadId).toBeTruthy();

      const sent = await aiChat.sendMessage(role, {
        threadId,
        profileId,
        message: "Reply with the single word OK.",
      });
      expect(sent.status).toBe(200);
      expect(sent.streamError).toBeUndefined();
      expectHealthyAssistantReply(
        await aiChat.waitForAssistantReply(role, threadId),
      );

      const listed = await aiChat.listThreads(role);
      expect(listed.status).toBe(200);
      expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);
    });
  }

  test("GET /api/2.0/ai/threads/list, get-by-id - one user's global chat is invisible to another", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The entity-less list is one shared bucket across locations; this pins that
    // the sharing stops at the user boundary, which is what makes the global panel
    // usable at all.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const member = await apiSdk.addMember("owner", "RoomAdmin");
    const memberId = member.data.response!.id!;

    const ownerThread = await aiChat.createThreadId("owner", {
      title: "Autotest owner global chat",
      profileId,
    });

    // Everything owner-side is done; from here the shared request context acts as
    // the member.
    await apiSdk.authenticateMember(member.userData, "RoomAdmin");
    await aiChat.expectActingAs("roomAdmin", memberId, "the member");

    const listed = await aiChat.listThreads("roomAdmin");
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).not.toContain(
      ownerThread,
    );

    expect((await aiChat.getThread("roomAdmin", ownerThread)).status).toBe(403);
    expect((await aiChat.readMessages("roomAdmin", ownerThread)).status).toBe(
      403,
    );

    // Positive control: the member's own global chat does land in that same list,
    // so the absence above is isolation and not a read that returns nothing.
    const memberThread = await aiChat.createThreadId("roomAdmin", {
      title: "Autotest member global chat",
      profileId,
    });
    const memberList = await aiChat.listThreads("roomAdmin");
    expect(memberList.status).toBe(200);
    expect(memberList.data.map((thread) => thread.threadId)).toEqual([
      memberThread,
    ]);
  });

  test("POST /api/2.0/ai/threads/create, send-with-stream, GET list - a Guest has no global chat", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The one user type the global entry point is closed to. Nothing about a room
    // is involved here — the chat is scoped to nothing — so this is the AI surface
    // refusing a Guest outright, the same way /ai/preferences and saving a chat
    // attachment do.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    // A working global chat of the Owner's to aim the Guest's calls at.
    const ownerThread = await aiChat.createThreadId("owner", {
      title: "Autotest owner global chat",
      profileId,
    });

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    // The session is the Guest's, so the refusals below are the user type and not
    // a request that never authenticated.
    await aiChat.expectActingAs("guest", guestData.response!.id!, "Guest");

    const created = await aiChat.createThread("guest", {
      title: GLOBAL_CHAT_TITLE,
      profileId,
    });
    expect(created.status, "a Guest starting a global chat").toBe(403);
    expect(created.threadId).toBe("");

    const sent = await aiChat.sendMessage("guest", {
      threadId: ownerThread,
      profileId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status, "a Guest sending into a global chat").toBe(403);

    const listed = await aiChat.listThreads("guest");
    expect(listed.status, "a Guest listing global chats").toBe(403);
  });

  test("BUG 82855: GET /api/2.0/ai/threads/list - the global chat's history is listed inside rooms and folders", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The other direction of the shared bucket: a chat started from the portal
    // interface, with no entity at all, is listed when the same user opens the
    // chat panel in an unrelated room and in a folder. Confirmed by design
    // (BUG 82855, dev response 2026-08-24: isolation only exists inside agents).
    // An agent is made alongside as the control — its scope stays clean, so this
    // is the room/folder behaviour specifically and not "entityId does nothing".
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Global Control Agent",
      profileId,
    });
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Global Chat Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const folderId = myFolder.response!.current!.id!;

    const globalThread = await aiChat.createThreadId("owner", {
      title: GLOBAL_CHAT_TITLE,
      profileId,
    });

    // Control: an agent's scope does not pick the global chat up.
    const agentThreads = await aiChat.listThreads("owner", agentId);
    expect(agentThreads.status).toBe(200);
    expect(
      agentThreads.data.map((thread) => thread.threadId),
      "the global chat must not be listed for an agent",
    ).not.toContain(globalThread);

    const scopes: Array<[string, number | string]> = [
      ["a room", roomId],
      ["My Documents", folderId],
    ];

    for (const [label, entityId] of scopes) {
      const listed = await aiChat.listThreads("owner", entityId);
      expect(listed.status, `listing threads for ${label}`).toBe(200);
      expect(
        listed.data.map((thread) => thread.threadId),
        `the global chat's thread is listed for ${label}`,
      ).toContain(globalThread);
    }
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
// What the portal actually does, measured on 2026-08-05 and confirmed by design
// on 2026-08-24 (dev response to BUG 82855: "chat is isolated inside agents;
// outside an agent it shares one context across every other entity"), is split
// in two:
//
//   * An AGENT id is a real scope. Its threads are listed for it and for
//     nothing else. So is a roomType 9 room made through /files/rooms, which is
//     the same room type without the agent record — the scope follows the AI room
//     type, not the agent factory ("an AI room created through the rooms API").
//   * Every OTHER value — an ordinary room id, a folder id, a string that is not
//     an id at all, or no entityId — resolves to one single shared bucket. A
//     thread started while looking at room A is listed when looking at room B.
//     That is the contract the tests below pin, now that BUG 82855 is closed
//     as intended behaviour rather than a defect to fix.
//
// Since every non-agent scope is really the same bucket, "a room inherits its
// subfolders' threads" (product language from 2026-08-13) isn't a nesting rule
// with an inside and an outside — there is no boundary at all outside an agent,
// so a room, its subfolders at any depth, an unrelated room and a folder outside
// either of them all list the exact same set of threads.
//
// Per-user isolation is unaffected and holds: the bucket is per user, so another
// member never sees these threads. That is asserted here too, because a test
// that only showed the shared bucket would leave "does it cross users as well"
// open.

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
    // and then ignored for everything that is not an agent — confirmed by design
    // (BUG 82855, dev response 2026-08-24). An agent thread is created alongside
    // as the control — that one IS scoped, so this is the room/folder context
    // specifically, not "entityId does nothing".
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

    for (const [label, entityId] of scopes) {
      const listed = await aiChat.listThreads("owner", entityId);
      expect(listed.status, `listing threads for ${label}`).toBe(200);
      expect(
        listed.data.map((thread) => thread.threadId),
        `room A's thread is listed for ${label}`,
      ).toContain(inRoomA);
      // Whatever else is shared, the agent's thread stays in the agent.
      expect(
        listed.data.map((thread) => thread.threadId),
        `the agent's thread must not be listed for ${label}`,
      ).not.toContain(inAgent);
    }
  });

  test("BUG 82855: GET /api/2.0/ai/threads/list - a thread started in a folder is listed for every other folder and room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The test above starts its thread in a room. This one starts it in a folder,
    // which is the scope the composer sends while the user is browsing documents,
    // and it checks the pairs that one does too: folder -> sibling folder,
    // folder -> a room, folder -> a folder inside a room. Confirmed by design
    // (BUG 82855) applies to every location, and "room A vs room B" alone would
    // leave folder-to-folder open to the assumption that both kinds of id travel
    // through the same code — they are the same id space, but the entity is
    // resolved before it is scoped, and Trash/file ids already show that
    // resolution treating ids alike is not something to assume (BUG 82719).
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    // The control scope: an agent, the one entity that is really scoped.
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Folder Scope Agent",
      profileId,
    });

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const myDocsId = myFolder.response!.current!.id!;
    const siblings: number[] = [];
    for (const title of [
      "Autotest Scope Folder A",
      "Autotest Scope Folder B",
    ]) {
      const { data } = await ownerApi.folders.createFolder({
        folderId: myDocsId,
        createFolder: { title },
      });
      siblings.push(data.response!.id!);
    }
    const [folderAId, folderBId] = siblings;

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Folder Scope Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const { data: sub } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Scope Subfolder" },
    });
    const subFolderId = sub.response!.id!;

    const inFolderA = await aiChat.createThreadId("owner", {
      title: "Autotest thread in folder A",
      profileId,
      agentId: folderAId,
    });

    // Positive control: the thread is listed for the folder it was started in, so
    // an empty list further down would be scoping and not a thread that never
    // appeared.
    const own = await aiChat.listThreads("owner", folderAId);
    expect(own.status).toBe(200);
    expect(own.data.map((thread) => thread.threadId)).toContain(inFolderA);

    // And the direction that does hold today: it does not reach into an agent.
    const agentScope = await aiChat.listThreads("owner", agentId);
    expect(agentScope.status).toBe(200);
    expect(
      agentScope.data.map((thread) => thread.threadId),
      "a folder's thread must not be listed for an agent",
    ).not.toContain(inFolderA);

    const scopes: Array<[string, number]> = [
      ["the sibling folder", folderBId],
      ["an unrelated room", roomId],
      ["a folder inside that room", subFolderId],
    ];

    for (const [label, entityId] of scopes) {
      const listed = await aiChat.listThreads("owner", entityId);
      expect(listed.status, `listing threads for ${label}`).toBe(200);
      expect(
        listed.data.map((thread) => thread.threadId),
        `folder A's thread is listed for ${label}`,
      ).toContain(inFolderA);
    }
  });

  // "A room inherits the threads of its subfolders" was floated as a product
  // decision on 2026-08-13, but the dev response to BUG 82855 (2026-08-24) makes
  // it moot: outside an agent there is no per-location boundary at all, so a
  // room, its subfolders at any depth, an unrelated room and a folder outside
  // either of them are not in an inheritance relationship — they all resolve to
  // the exact same shared bucket. This test pins that flattened reality instead
  // of a nesting rule that has no boundary left to apply to.
  test("BUG 82855: GET /api/2.0/ai/threads/list - a room, its subfolders, another room and an outside folder all list the same shared bucket", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Nesting Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const { data: sub } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: "Autotest Nesting Subfolder" },
    });
    const subFolderId = sub.response!.id!;
    // Two levels down: inheritance has to be transitive, not just one hop.
    const { data: deep } = await ownerApi.folders.createFolder({
      folderId: subFolderId,
      createFolder: { title: "Autotest Nesting Deep Subfolder" },
    });
    const deepFolderId = deep.response!.id!;

    // Everything outside the room, to say what the room must not inherit: a
    // folder of the user's own documents and a second room.
    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const { data: outside } = await ownerApi.folders.createFolder({
      folderId: myFolder.response!.current!.id!,
      createFolder: { title: "Autotest Nesting Outside Folder" },
    });
    const outsideFolderId = outside.response!.id!;
    const { data: otherRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Nesting Other Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const otherRoomId = otherRoom.response!.id!;

    const inRoomRoot = await aiChat.createThreadId("owner", {
      title: "Autotest thread in the room root",
      profileId,
      agentId: roomId,
    });
    const inSubFolder = await aiChat.createThreadId("owner", {
      title: "Autotest thread in the subfolder",
      profileId,
      agentId: subFolderId,
    });
    const inDeepFolder = await aiChat.createThreadId("owner", {
      title: "Autotest thread two levels down",
      profileId,
      agentId: deepFolderId,
    });
    const inOutsideFolder = await aiChat.createThreadId("owner", {
      title: "Autotest thread outside the room",
      profileId,
      agentId: outsideFolderId,
    });

    // Every one of the four threads, wherever it was started, is listed for
    // every one of the four locations — the room root, its subfolder, its deep
    // subfolder and the folder outside the room. There is no per-location
    // boundary to check separately.
    const allThreads = [inRoomRoot, inSubFolder, inDeepFolder, inOutsideFolder];
    const locations: Array<[string, number]> = [
      ["the room root", roomId],
      ["the subfolder", subFolderId],
      ["the deep subfolder", deepFolderId],
      ["the folder outside the room", outsideFolderId],
      ["an unrelated room", otherRoomId],
    ];

    for (const [label, entityId] of locations) {
      const listed = await aiChat.listThreads("owner", entityId);
      expect(listed.status, `listing ${label}`).toBe(200);
      const ids = listed.data.map((thread) => thread.threadId);
      for (const threadId of allThreads) {
        expect(
          ids,
          `${label} lists every thread in the shared bucket`,
        ).toContain(threadId);
      }
    }
  });

  test("GET /api/2.0/ai/threads/get-by-id, read-messages, POST /api/2.0/ai/ai/send-with-stream - a thread is read and continued from another location", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The binding only ever reaches `threads/list`. `get-by-id`, `read-messages`,
    // `rename`, `delete` and the per-message routes take a `threadId` and no
    // entity at all, and `send-with-stream` does take one but does not check it
    // against the thread's own. So a thread started in room A is fully usable
    // while the client says it is in room B, and a thread record carries no scope
    // field to compare against either.
    //
    // Asserted green because that is today's contract, and the shared bucket
    // outside agents (BUG 82855, confirmed by design) hides it: whatever "bound
    // to the room" comes to mean, this test says which routes the binding is
    // currently absent from, and it turns red the moment one of them starts
    // enforcing a scope.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const roomIds: number[] = [];
    for (const title of [
      "Autotest Mismatch Room A",
      "Autotest Mismatch Room B",
    ])
      roomIds.push(
        (
          await ownerApi.rooms.createRoom({
            createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
          })
        ).data.response!.id!,
      );
    const [roomAId, roomBId] = roomIds;

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread of room A",
      profileId,
      agentId: roomAId,
    });
    const first = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomAId,
      message: "Reply with the single word OK.",
    });
    expect(first.status).toBe(200);
    expect(first.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    // Neither read route takes an entity, so there is nothing to scope on: the
    // thread of room A answers the same wherever the client claims to be.
    const info = await aiChat.getThread("owner", threadId);
    expect(info.status).toBe(200);
    expect(info.data?.threadId).toBe(threadId);
    // And the record does not publish the location it was started in, so a
    // client cannot check the scope itself.
    expect(
      Object.keys(info.data ?? {}),
      "a thread record carries no entity field",
    ).not.toContain("entityId");

    const read = await aiChat.readMessages("owner", threadId);
    expect(read.status).toBe(200);
    expect(read.data).toHaveLength(2);

    // The send does carry an entity, and a wrong one is not refused: the reply
    // lands in the same thread.
    const fromRoomB = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomBId,
      message: "Reply with the single word FINE.",
    });
    expect(fromRoomB.status).toBe(200);
    expect(fromRoomB.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReplies("owner", threadId, 2),
      2,
    );
    const after = await aiChat.readMessages("owner", threadId);
    expect(after.status).toBe(200);
    expect(after.data).toHaveLength(4);
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
    expect((await aiChat.getThread("owner", threadId)).status).toBe(404);
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

  test("BUG 82858: GET /api/2.0/ai/threads/list - listing the threads of a room the user cannot see is refused", async ({
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

    // A room the caller cannot open is refused the way read-messages refuses
    // another user's thread. It used to crash with a 500.
    const listed = await aiChat.listThreads("user", roomId);
    expect(listed.status).toBe(403);
  });

  test("POST /api/2.0/ai/threads/open-or-create, GET get-by-id - a room member reopens their own thread with its history and its model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Both halves of "a thread carries its own history and its own model, and
    // gets them back when it is opened" are otherwise measured on the Owner
    // only. A member of a shared room is the case the requirement is actually
    // about: their thread is theirs, the model in it is their pick (a room has
    // no fixed one), and the room around it belongs to somebody else.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

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

    // The Owner's own thread in the same room, on the other model. It is what
    // makes "the member's thread came back with ITS model" mean something: with
    // one thread in the room, a backend answering with the room's newest thread
    // would pass.
    const ownerThread = await aiChat.createThreadId("owner", {
      title: "Autotest owner room thread",
      profileId: first.id,
      agentId: roomId,
    });
    const ownerAppended = await aiChat.appendUserMessage("owner", {
      threadId: ownerThread,
      profileId: first.id,
      text: "Autotest owner question",
    });
    expect(ownerAppended.status).toBe(200);

    // Everything owner-side is done; from here the shared request context acts
    // as the member.
    await apiSdk.authenticateMember(member.userData, "RoomAdmin");
    await aiChat.expectActingAs("roomAdmin", memberId, "the invited member");

    const memberThread = await aiChat.createThreadId("roomAdmin", {
      title: "Autotest member room thread",
      profileId: second.id,
      agentId: roomId,
    });
    const sent = await aiChat.sendMessage("roomAdmin", {
      threadId: memberThread,
      profileId: second.id,
      agentId: roomId,
      message: "Remember the code word ORANGE. Reply with just: OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    const stored = await aiChat.waitForAssistantReply(
      "roomAdmin",
      memberThread,
    );
    expectHealthyAssistantReply(stored);

    const { status, data } = await aiChat.openOrCreateThread("roomAdmin", {
      threadId: memberThread,
      profile: second,
      entityId: String(roomId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });

    expect(status).toBe(200);
    expect(data?.threadId, "the member's own thread is reused").toBe(
      memberThread,
    );

    const replayed = (data?.priorMessages ?? []) as AiThreadMessage[];
    expect(replayed.map((message) => message.id)).toEqual(
      stored.map((message) => message.id),
    );
    expect(replayed.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(
      AiAgentChat.messageText(replayed[0]),
      "the member's question, not the Owner's",
    ).toBe("Remember the code word ORANGE. Reply with just: OK.");

    const reopened = await aiChat.getThread("roomAdmin", memberThread);
    expect(reopened.status).toBe(200);
    expect(
      reopened.data?.profileId,
      "and the model the member picked, not the one the Owner's thread runs on",
    ).toBe(second.id);
    expect(
      (await aiChat.listThreads("roomAdmin", roomId)).data.find(
        (thread) => thread.threadId === memberThread,
      )?.profileId,
    ).toBe(second.id);
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

  test("BUG 82895: GET /api/2.0/ai/assignments - the scope of a room the caller cannot open returns 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Third route in the same family, and the last one still doing it: naming a
    // room the caller has no access to crashes the access check instead of
    // refusing it. `get-deep-mode` (BUG 82816) and `threads/list` (BUG 82858)
    // both answer 403 now; this is /ai/assignments. A member of the room is
    // answered normally (portal-wide fallback), so the 500 really is the access
    // check and not a broken scope parameter.
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

    // A room, not an agent: an agent fixes its own model and a thread in it is
    // not the user's to point elsewhere ("the model of an agent room" below).
    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const agentId = room.response!.id!;

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
    // the new choice rides along with the next message — and sticks. Staged in a
    // room, the context the picker is actually shown in.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: first.id,
    });
    expect(bound.data?.success).toBe(true);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const agentId = room.response!.id!;
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

    // The switch was per thread: the binding the location resolves through has
    // not moved, so a new conversation still starts on `first`.
    const binding = await profiles.getAllAssignments("owner");
    expect(binding.status).toBe(200);
    expect(binding.data?.Chat).toBe(first.id);

    const sibling = await aiChat.createThreadId("owner", {
      title: "Autotest sibling thread",
      profileId: first.id,
      agentId,
    });
    expect((await aiChat.getThread("owner", sibling)).data?.profileId).toBe(
      first.id,
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - the conversation carries over to the model the picker switched to", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The test above pins that the switch is *stored*. This is the half the user
    // feels: the model just picked has to answer from what was said to the
    // previous one. A backend that started a fresh conversation whenever the
    // model changed would pass the stored-profileId test and fail this one.
    //
    // Two inference turns with a poll between them.
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread that changes its model",
      profileId: first.id,
      agentId: roomId,
    });

    const taught = await aiChat.sendMessage("owner", {
      threadId,
      profileId: first.id,
      agentId: roomId,
      message: "Remember the code word ORANGE. Reply with just: OK.",
    });
    expect(taught.status).toBe(200);
    expect(taught.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReplies("owner", threadId, 1, 120000),
    );

    // The picker moves to the other model mid-conversation. The question can
    // only be answered from the turn the first model was given.
    const asked = await aiChat.sendMessage("owner", {
      threadId,
      profileId: second.id,
      agentId: roomId,
      message:
        "What code word did I ask you to remember? Reply with just that word.",
    });
    expect(asked.status).toBe(200);
    expect(asked.streamError).toBeUndefined();
    const messages = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      2,
      120000,
    );
    expectHealthyAssistantReply(messages, 2);

    expect(
      AiAgentChat.messageText(
        AiAgentChat.assistantMessages(messages)[1],
      ).toUpperCase(),
      "the model the picker switched to answers from the earlier turn",
    ).toContain("ORANGE");

    // The transcript survived the switch whole, and the switch stuck.
    expect(
      AiAgentChat.userMessages(messages).map((message) =>
        AiAgentChat.messageText(message),
      ),
    ).toEqual([
      "Remember the code word ORANGE. Reply with just: OK.",
      "What code word did I ask you to remember? Reply with just that word.",
    ]);
    expect((await aiChat.getThread("owner", threadId)).data?.profileId).toBe(
      second.id,
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a room member switches the model of their own thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Switching by send is otherwise measured on the Owner only, and the Owner
    // is the one case where "the choice belongs to the user" cannot be told from
    // "the choice belongs to whoever owns the room". A member of somebody else's
    // room is who the picker is for.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Shared Model Room",
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

    // Everything owner-side is done; from here the shared request context acts
    // as the member.
    await apiSdk.authenticateMember(member.userData, "RoomAdmin");
    await aiChat.expectActingAs("roomAdmin", memberId, "the invited member");

    const threadId = await aiChat.createThreadId("roomAdmin", {
      title: "Autotest member thread",
      profileId: first.id,
      agentId: roomId,
    });
    expect(
      (await aiChat.getThread("roomAdmin", threadId)).data?.profileId,
      "the thread starts on the model the member picked",
    ).toBe(first.id);

    const sent = await aiChat.sendMessage("roomAdmin", {
      threadId,
      profileId: second.id,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("roomAdmin", threadId),
    );

    const moved = await aiChat.getThread("roomAdmin", threadId);
    expect(moved.status).toBe(200);
    expect(
      moved.data?.profileId,
      "the member's own switch is what the thread now runs on",
    ).toBe(second.id);
    expect(
      (await aiChat.listThreads("roomAdmin", roomId)).data.find(
        (thread) => thread.threadId === threadId,
      )?.profileId,
      "and the list the picker is drawn from agrees",
    ).toBe(second.id);
  });

  test("BUG 82860: POST /api/2.0/ai/ai/send-with-stream - a message with no profileId keeps the thread's chosen model", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // A client that lets the user pick a model once and then sends plain
    // messages used to lose the choice on the first of them: with no `profileId`
    // in the body the backend resolved the entity's model and wrote THAT onto
    // the thread, instead of using the one the thread already carries.
    //
    // A room, because a room is where the choice is the user's to make. The same
    // resolution in an agent is not this bug but the intended fixation — the
    // agent's own model is what a conversation in it must run on, which is the
    // first test of "the model of an agent room" below.
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

    // The room resolves through the portal-wide binding, so it has to be pointed
    // at a profile the thread is NOT on — otherwise "the model did not change"
    // and "it was replaced by the one it already had" look the same.
    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: first.id,
    });
    expect(bound.data?.success).toBe(true);
    const resolved = await profiles.resolveForAction("owner", "Chat", roomId);
    expect(
      resolved.data?.profileId,
      "the room resolves the other profile",
    ).toBe(first.id);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread in a room",
      profileId: second.id,
      agentId: roomId,
    });
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the thread starts on the chosen model",
    ).toBe(second.id);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      agentId: roomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    await aiChat.waitForAssistantReply("owner", threadId);

    const kept = (await aiChat.getThread("owner", threadId)).data?.profileId;
    expect(kept, "the thread keeps the model it was created with").toBe(
      second.id,
    );
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

  // The send is the only route that WRITES a thread's model, so a `profileId`
  // the backend cannot resolve is a question about the picker and not just about
  // input validation. Both tests below are staged with the portal-wide Chat
  // binding on `first` and the thread on `second`, so "kept its own model", "took
  // the room's" and "was wiped" are three distinguishable outcomes.
  const UNKNOWN_PROFILE_ID = "019ed118-0000-0000-0000-0000000000ff";

  async function roomThreadOnSecondModel(
    apiSdk: ApiSDK,
    aiChat: AiAgentChat,
    profiles: AiProfiles,
    first: string,
    second: string,
  ) {
    const { data: room } = await apiSdk.forRole("owner").rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Model Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: first,
    });
    expect(bound.data?.success).toBe(true);
    const resolved = await profiles.resolveForAction("owner", "Chat", roomId);
    expect(
      resolved.data?.profileId,
      "the room resolves the other profile",
    ).toBe(first);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread in a room",
      profileId: second,
      agentId: roomId,
    });
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the thread starts on the chosen model",
    ).toBe(second);

    return { roomId, threadId };
  }

  test("BUG 83160: POST /api/2.0/ai/ai/send-with-stream - a profileId that names no model is answered instead of refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The id `create` answers 404 to. On the send it is dropped in silence: the
    // question is answered normally, by whatever model the backend picked
    // instead, and the client is told nothing — so a picker pointed at a model
    // that has gone away (or a client with a stale catalogue) produces a
    // conversation running on a model nobody chose. Every other failure on this
    // surface arrives either as a status or as an `error` frame.
    //
    // The thread itself is not corrupted, which is the one thing that could have
    // made this worse, and is asserted before the report.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));
    const { roomId, threadId } = await roomThreadOnSecondModel(
      apiSdk,
      aiChat,
      profiles,
      first.id,
      second.id,
    );

    const bad = await aiChat.sendMessage("owner", {
      threadId,
      profileId: UNKNOWN_PROFILE_ID,
      agentId: roomId,
      message: "Reply with the single word OK.",
      timeoutMs: STREAM_CAP_MS,
    });

    // The thread was not stamped with the unresolvable id, and it did not take
    // the room's binding either — it stayed on the model it was created with.
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the thread keeps the model it was on",
    ).toBe(second.id);

    // The question really was answered, which is what makes the silence a
    // problem rather than a cosmetic one: the user sees an ordinary reply.
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    // Fix-agnostic: a 4xx like create's, or an `error` frame inside the 200 the
    // way a model failure is reported, both satisfy this. Only today's silent
    // success does not.
    test.fail();
    expect(
      bad.status !== 200 || bad.streamError !== undefined,
      "a model choice the backend cannot resolve is reported, not dropped",
    ).toBe(true);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a blank profileId leaves the thread's model alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `""` is what a client sends when its picker holds nothing. `create` refuses
    // it (400); the send takes it, answers the question and leaves the thread on
    // its own model — which is the important half, because it is NOT how an
    // omitted `profileId` behaves: that one overwrites the thread with the
    // portal-wide binding (BUG 82860 above). The binding here points at `first`
    // and the thread is on `second`, so the two paths cannot be confused.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));
    const { roomId, threadId } = await roomThreadOnSecondModel(
      apiSdk,
      aiChat,
      profiles,
      first.id,
      second.id,
    );

    const blank = await aiChat.sendMessage("owner", {
      threadId,
      profileId: "",
      agentId: roomId,
      message: "Reply with the single word OK.",
      timeoutMs: STREAM_CAP_MS,
    });
    expect(blank.status).toBe(200);
    expect(blank.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "a blank id is not an omission: the thread keeps its own model",
    ).toBe(second.id);
    expect(
      (await aiChat.listThreads("owner", roomId)).data.find(
        (thread) => thread.threadId === threadId,
      )?.profileId,
    ).toBe(second.id);
  });

  test("POST /api/2.0/ai/threads/create - two threads on a folder entity keep their own models", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The picker is shown everywhere except an agent, and a folder is the third
    // context it appears in (agent, room, folder). Worth its own case because
    // every non-agent entity shares one thread list (BUG 82855, confirmed by
    // design) — the model has to stay attached to the thread even though the
    // listing does not separate the entities.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const { data: myFolder } = await ownerApi.folders.getMyFolder();
    const { data: folder } = await ownerApi.folders.createFolder({
      folderId: myFolder.response!.current!.id!,
      createFolder: { title: "Autotest Model Folder" },
    });
    const folderId = folder.response!.id!;

    const threadA = await aiChat.createThreadId("owner", {
      title: "Autotest folder thread on the first model",
      profileId: first.id,
      agentId: folderId,
    });
    const threadB = await aiChat.createThreadId("owner", {
      title: "Autotest folder thread on the second model",
      profileId: second.id,
      agentId: folderId,
    });

    expect((await aiChat.getThread("owner", threadA)).data?.profileId).toBe(
      first.id,
    );
    expect((await aiChat.getThread("owner", threadB)).data?.profileId).toBe(
      second.id,
    );

    const listed = await aiChat.listThreads("owner", folderId);
    expect(listed.status).toBe(200);
    const byId = new Map(
      listed.data.map((thread) => [thread.threadId, thread.profileId]),
    );
    expect(byId.get(threadA)).toBe(first.id);
    expect(byId.get(threadB)).toBe(second.id);
  });
});

// ---------------------------------------------------------------------------
// The model of an agent room.
//
// An agent is the one place where the model is not the user's to pick: the
// composer hides the picker because the agent is built on a profile and every
// conversation in it is meant to run on that one. Everywhere else the picker is
// shown and the choice is per thread (the block above).
//
// What the backend puts behind that:
//
//   * the agent's own entity scope carries a Chat binding, and a send that omits
//     `profileId` resolves through it — so a client that never sends a profile
//     gets the agent's model;
//   * `PUT /ai/agents/{id}` with a new `profileId` is the only way to move it,
//     and it must not reach into conversations already under way;
//   * the agent record and the entity-scoped assignment both publish the fixed
//     model, and a member can read either one.
//
// And the part that does not hold: nothing enforces it. `profileId` is taken from
// whoever sends it, so a thread in an agent can be started on another model and an
// existing one can be moved onto another model mid-conversation. The fixation is
// implemented in the composer, not in the API, which means it is only as strong as
// the client: anything speaking to the API directly runs the agent's room, prompt
// and quota on a model its author never chose, and leaves the agent holding a
// conversation the UI cannot produce.
//
// The four BUG tests below are parameterized over the Owner and a member on
// purpose. The model is fixed by the *kind of room*, so the author being the one
// doing it changes nothing — an Owner override is a state the UI has no way to
// create either. They assert `not.toBe(the other profile)` rather than a status,
// so both honest fixes flip them to an unexpected pass: refusing the request, or
// accepting it and running the agent's own model anyway.

test.describe("AI Chat - the model of an agent room", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - a chat in an agent with no profileId anywhere runs on the agent's profile", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const routes = new ThreadRoutes(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    // The portal-wide Chat binding points somewhere else on purpose, so "the
    // agent's profile answered" cannot be "it fell back to the portal's".
    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: second.id,
    });
    expect(bound.data?.success).toBe(true);

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // A client with no picker sends no profileId at all — not on create…
    const created = await routes.post("owner", "/api/2.0/ai/threads/create", {
      title: "Autotest agent thread",
      entityId: String(agentId),
    });
    expect(created.status).toBe(200);
    const threadId = created.data?.threadId ?? "";
    expect(threadId).toBeTruthy();
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the thread starts with no model of its own",
    ).toBeUndefined();

    // …and not on the message either.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    // The agent's own binding is what answered, and it is what the thread now
    // carries.
    const resolved = await profiles.resolveForAction("owner", "Chat", agentId);
    expect(resolved.status).toBe(200);
    expect(resolved.data?.profileId).toBe(first.id);
    expect((await aiChat.getThread("owner", threadId)).data?.profileId).toBe(
      first.id,
    );
  });

  test("PUT /api/2.0/ai/agents/{id} - a new profileId moves the agent's model and leaves existing threads alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The only way to change an agent's fixed model, and the counterpart of
    // "rebinding Chat does not move an existing thread" for the agent scope.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const routes = new ThreadRoutes(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const before = await aiChat.createThreadId("owner", {
      title: "Autotest thread from before the switch",
      profileId: first.id,
      agentId,
    });

    const updated = await aiChat.updateAgent("owner", agentId, {
      title: "Autotest Fixed Model Agent",
      profileId: second.id,
    });
    expect(updated.status).toBe(200);

    // The agent resolves to the new model in every read the composer uses.
    expect(
      (await aiChat.getAgentInfo("owner", agentId)).data?.response?.profileId,
      "the agent record carries the new model",
    ).toBe(second.id);
    const binding = await profiles.getAllAssignments("owner", agentId);
    expect(binding.status).toBe(200);
    expect(binding.data?.Chat).toBe(second.id);
    const resolved = await profiles.resolveForAction("owner", "Chat", agentId);
    expect(resolved.data?.profileId).toBe(second.id);

    // A conversation started before the switch keeps the model it ran on.
    expect(
      (await aiChat.getThread("owner", before)).data?.profileId,
      "the older thread is untouched",
    ).toBe(first.id);

    // A new one, sent the way a picker-less client sends, is answered by the new
    // model.
    const created = await routes.post("owner", "/api/2.0/ai/threads/create", {
      title: "Autotest thread from after the switch",
      entityId: String(agentId),
    });
    expect(created.status).toBe(200);
    const after = created.data?.threadId ?? "";
    expect(after).toBeTruthy();

    const sent = await aiChat.sendMessage("owner", {
      threadId: after,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", after),
    );

    expect((await aiChat.getThread("owner", after)).data?.profileId).toBe(
      second.id,
    );
  });

  test("GET /api/2.0/ai/agents/{id} - the agent publishes its fixed model, and a member can read it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Where a composer with a hidden picker gets the name of the fixed model
    // from. Two places, and they have to agree: the agent record carries a
    // `profileId` (which the SDK's own agent DTO does not declare, so a client
    // typed off it cannot see the field at all) and the agent's assignment scope
    // carries the same id as its Chat binding. Both have to answer for a member
    // as well, or the label can only be drawn for the author.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
      prompt: SHORT_ANSWER_PROMPT,
    });

    const info = await aiChat.getAgentInfo("owner", agentId);
    expect(info.status).toBe(200);
    expect(info.data?.response?.profileId).toBe(first.id);
    expect(info.data?.response?.chatSettings?.prompt).toBe(SHORT_ANSWER_PROMPT);

    const binding = await profiles.getAllAssignments("owner", agentId);
    expect(binding.status).toBe(200);
    expect(binding.data?.Chat).toBe(first.id);

    // A member of the agent reads both of them.
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await inviteToAgent(ownerApi.rooms, agentId, memberData.response!.id!);

    const memberInfo = await aiChat.getAgentInfo("user", agentId);
    expect(memberInfo.status).toBe(200);
    expect(memberInfo.data?.response?.profileId).toBe(first.id);

    const memberBinding = await profiles.getAllAssignments("user", agentId);
    expect(memberBinding.status).toBe(200);
    expect(memberBinding.data?.Chat).toBe(first.id);
  });

  // Owner is the agent's author; the member is invited at ContentCreator, the
  // lowest level that can use an agent at all (Read cannot, and a Guest never
  // gets above Read — see chat.permission.spec.ts).
  for (const { label, role, type } of [
    { label: "Owner", role: "owner", type: undefined },
    { label: "a member", role: "user", type: "User" },
  ] as Array<{ label: string; role: AgentRole; type?: UserType }>) {
    test(`BUG 82914: POST /api/2.0/ai/ai/send-with-stream - ${label} can override the fixed model of an agent room`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      // The agent is bound to profile A and the conversation starts on it; the
      // send then names profile B. The model an agent room runs on is not the
      // caller's to change, so B has to be refused or ignored — instead it is
      // written onto the thread and every following turn uses it.
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const [first, second] = twoTextProfiles(
        await aiChat.listProfiles("owner"),
      );

      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Fixed Model Agent",
        profileId: first.id,
        prompt: SHORT_ANSWER_PROMPT,
      });

      if (type) {
        const { data: memberData } = await apiSdk.addAuthenticatedMember(
          "owner",
          type,
        );
        await inviteToAgent(ownerApi.rooms, agentId, memberData.response!.id!);
      }

      // Setup premise: the agent really is fixed on A, and the thread starts on
      // it, so the value read at the end can only have come from the send.
      expect(
        (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
        "the agent is bound to the first profile",
      ).toBe(first.id);
      const threadId = await aiChat.createThreadId(role, {
        title: "Autotest thread on the agent's own model",
        profileId: first.id,
        agentId,
      });

      // Nothing between here and test.fail() may assert, or a fix that refuses
      // the send would keep this red instead of reporting an unexpected pass.
      await aiChat.sendMessage(role, {
        threadId,
        profileId: second.id,
        agentId,
        message: "Reply with the single word OK.",
      });
      const stored = (await aiChat.getThread(role, threadId)).data?.profileId;

      test.fail();
      expect(
        stored,
        "the conversation does not move onto a model the agent was not built on",
      ).not.toBe(second.id);
    });

    test(`BUG 82915: POST /api/2.0/ai/threads/create - ${label} can start a thread in an agent room on another model`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      // The same hole one step earlier: the override does not need a send at all,
      // it can be baked in when the conversation is created. A thread in an agent
      // has no model of its own to choose — the agent's is the model — so the
      // create either refuses profile B or stores the agent's A.
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const [first, second] = twoTextProfiles(
        await aiChat.listProfiles("owner"),
      );

      const agentId = await aiChat.createAgentId("owner", {
        title: "Autotest Fixed Model Agent",
        profileId: first.id,
        prompt: SHORT_ANSWER_PROMPT,
      });

      if (type) {
        const { data: memberData } = await apiSdk.addAuthenticatedMember(
          "owner",
          type,
        );
        await inviteToAgent(ownerApi.rooms, agentId, memberData.response!.id!);
      }

      expect(
        (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
        "the agent is bound to the first profile",
      ).toBe(first.id);

      const created = await aiChat.createThread(role, {
        title: "Autotest thread on another model",
        profileId: second.id,
        agentId,
      });
      // A refusal leaves no thread to read, and that is one of the two shapes a
      // fix can take, so the read is conditional rather than asserted.
      const stored = created.threadId
        ? (await aiChat.getThread(role, created.threadId)).data?.profileId
        : undefined;

      test.fail();
      expect(
        stored,
        "a thread in an agent cannot be created on another model",
      ).not.toBe(second.id);
    });
  }

  // The catalogue an agent's model is picked from has image profiles in it, and
  // the agent factory takes one without a word. What comes out is an agent
  // nobody can talk to: the model refuses every turn with `model_not_found`,
  // "400 model is not a chat model" — the same refusal the image block further
  // down measures from a room, except that in a room the user picked the profile
  // and can pick another one, while in an agent the model is fixed and the
  // picker is hidden. Every conversation in such an agent is dead on arrival.
  test("BUG 82926: POST /api/2.0/ai/agents - an agent can be built on an image profile and then cannot chat at all", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const imageProfile = AiProfiles.byCapabilities(
      await profiles.catalogue("owner"),
      AI_CAPS.imageOnly,
    );

    const created = await aiChat.createAgent("owner", {
      title: "Autotest Image Model Agent",
      profileId: imageProfile.id,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // Everything below runs only while the create is accepted, so a fix that
    // refuses it reports an unexpected pass instead of failing on setup.
    const agentId = created.data?.response?.id;
    let chatFailedWith: string | undefined;

    if (agentId) {
      expect(
        (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
        "the image profile really is what the agent is bound to",
      ).toBe(imageProfile.id);

      const threadId = await aiChat.createThreadId("owner", {
        title: "Autotest image agent thread",
        profileId: imageProfile.id,
        agentId,
      });
      // Sent the way a client with a hidden picker sends: no profileId, so the
      // model is whatever the agent was built on.
      await aiChat.sendMessage("owner", {
        threadId,
        agentId,
        message: "Reply with the single word OK.",
      });
      const reply = AiAgentChat.assistantMessages(
        await aiChat.waitForAssistantReply("owner", threadId),
      )[0];
      chatFailedWith = reply?.status?.error?.code;
    }

    test.fail();
    expect(
      { agentCreated: agentId !== undefined, chatFailedWith },
      "an agent is not built on a model that cannot hold a conversation",
    ).toEqual({ agentCreated: false, chatFailedWith: undefined });
  });

  // The same hole on the other endpoint, and the one that matters even after
  // the create is fixed: a working agent, built on a text model and already in
  // use, is moved onto the image profile by an ordinary update. It is accepted,
  // both reads of the model follow it, and from then on the agent answers
  // nothing — see the test above for what a chat in it looks like.
  test("BUG 82927: PUT /api/2.0/ai/agents/{id} - a working agent can be moved onto an image profile", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const [textProfile] = twoTextProfiles(catalogue);
    const imageProfile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.imageOnly,
    );

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Capability Agent",
      profileId: textProfile.id,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // Setup premise: the agent is on a model that can chat before the update.
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
      "the agent starts on a text profile",
    ).toBe(textProfile.id);

    await aiChat.updateAgent("owner", agentId, {
      title: "Autotest Capability Agent",
      profileId: imageProfile.id,
    });

    const info = await aiChat.getAgentInfo("owner", agentId);
    const scope = await profiles.getAllAssignments("owner", agentId);

    test.fail();
    expect(
      { profileId: info.data?.response?.profileId, chat: scope.data?.Chat },
      "an agent is not moved onto a model that cannot hold a conversation",
    ).toEqual({ profileId: textProfile.id, chat: textProfile.id });
  });

  test("BUG 82895: GET /api/2.0/ai/assignments/* - the scope of an agent the caller is not in returns 500", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Same crash as the room case in "the default model of a room", on the scope
    // that actually holds a binding: an agent's is the one entity scope with a
    // Chat profile in it, so a client that asks about an agent it may not see
    // gets a 500 instead of a refusal — from both reads of the pair.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId,
    });

    await apiSdk.addAuthenticatedMember("owner", "User");

    // Control: this user reads the portal-wide scope of the same route fine, so
    // what follows is the entity check and not a broken client.
    const portalWide = await profiles.getAllAssignments("user");
    expect(portalWide.status).toBe(200);
    expect(portalWide.data?.Default).toBeTruthy();

    const scoped = await profiles.getAllAssignments("user", agentId);
    const resolved = await profiles.resolveForAction("user", "Chat", agentId);

    test.fail();
    expect(
      { getAll: scoped.status, resolve: resolved.status },
      "an agent the caller is not in is refused, not crashed",
    ).toEqual({ getAll: 403, resolve: 403 });
  });

  // The three edge cases of a model choice — a profile carried by the open call,
  // a blank one and one that no longer resolves — are pinned for a room in "the
  // model of one thread". They are staged there because that is where the picker
  // is shown, and they are repeated here because inside an agent the same input
  // means something different: the client has no picker to have produced it, and
  // the user has no picker to correct it with. A room's user who ends up on the
  // wrong model picks again; an agent's cannot.

  // The same well-formed GUID naming no profile that `create` answers 404 to.
  // Kept local on purpose — the room block has its own copy, and the two blocks
  // are read separately.
  const UNRESOLVABLE_PROFILE_ID = "019ed118-0000-0000-0000-0000000000ff";

  test("POST /api/2.0/ai/threads/open-or-create - opening an agent thread with another profile does not stamp it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The one route a picker-less client cannot avoid naming a profile on: the
    // open call requires a whole `AiProfile` object, not just an id (pinned in
    // "AI Threads - open-or-create"), and in an agent there is no picker for
    // that object to have come from — so it is whatever the client happens to
    // hold: a stale pick, the portal default, the first entry of the catalogue.
    // None of them may become the model of a conversation in an agent, or simply
    // opening a chat would move it off the model the room fixes.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const routes = new ThreadRoutes(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
      prompt: SHORT_ANSWER_PROMPT,
    });
    // Setup premise: the agent really is fixed on the first profile, so the
    // second one below is a model this conversation has no business running on.
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
      "the agent is bound to the first profile",
    ).toBe(first.id);

    // Started the way a client with no picker starts one: no profileId at all.
    const created = await routes.post("owner", "/api/2.0/ai/threads/create", {
      title: "Autotest agent thread",
      entityId: String(agentId),
    });
    expect(created.status).toBe(200);
    const threadId = created.data?.threadId ?? "";
    expect(threadId).toBeTruthy();
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the thread starts with no model of its own",
    ).toBeUndefined();

    const opened = await aiChat.openOrCreateThread("owner", {
      threadId,
      profile: second,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });
    expect(opened.status).toBe(200);
    expect(opened.data?.threadId, "the existing thread is reused").toBe(
      threadId,
    );

    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the open did not write the profile it carried",
    ).toBeUndefined();

    // Positive control, and the point of the test in one step: the conversation
    // that follows the open runs on the agent's model. Without it "nothing was
    // written" would also be true of a thread whose model is never stored at
    // all, and a send with no profileId is exactly what the picker-less client
    // sends next.
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the agent's own model is what the conversation ended up on",
    ).toBe(first.id);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a blank profileId in an agent does not let the portal's model in", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `""` is what a client sends when its picker holds nothing — which in an
    // agent is every request, since the picker is hidden. It must not behave
    // like an omitted `profileId` does outside an agent: that one resolves the
    // portal-wide binding and writes it onto the thread (BUG 82860). The binding
    // here points at the second profile and the agent at the first, so a portal
    // leak is visible as a stored id and cannot be confused with the agent's
    // own model.
    //
    // Two outcomes are correct — the blank is ignored and the thread stays
    // modelless, or it resolves the agent's binding and lands on the first
    // profile — because both are "the room decides". Which model actually
    // produced the text is not observable (the stored reply carries no marker),
    // so the stored id is the honest assertion.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const routes = new ThreadRoutes(apiSdk.request, apiSdk.tokenStore);
    const [first, second] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: second.id,
    });
    expect(bound.data?.success).toBe(true);

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
      prompt: SHORT_ANSWER_PROMPT,
    });
    // Setup premise: the two bindings really do point at different models, or
    // "the portal's model did not get in" is unobservable.
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
      "the agent is bound to the first profile",
    ).toBe(first.id);
    expect(
      (await profiles.getAllAssignments("owner")).data?.Chat,
      "and the portal to the second one",
    ).toBe(second.id);

    const created = await routes.post("owner", "/api/2.0/ai/threads/create", {
      title: "Autotest agent thread",
      entityId: String(agentId),
    });
    expect(created.status).toBe(200);
    const threadId = created.data?.threadId ?? "";
    expect(threadId).toBeTruthy();

    const blank = await aiChat.sendMessage("owner", {
      threadId,
      profileId: "",
      agentId,
      message: "Reply with the single word OK.",
      timeoutMs: STREAM_CAP_MS,
    });
    expect(blank.status).toBe(200);
    expect(blank.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    const stored = (await aiChat.getThread("owner", threadId)).data?.profileId;
    expect(
      [undefined, first.id],
      "a blank pick leaves the agent deciding, not the portal",
    ).toContain(stored);
    expect(
      (await aiChat.listThreads("owner", agentId)).data.find(
        (thread) => thread.threadId === threadId,
      )?.profileId,
      "and the list agrees with get-by-id",
    ).toBe(stored);
  });

  test("BUG 83160: POST /api/2.0/ai/ai/send-with-stream - a profileId that names no model is answered in an agent too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The room half of this is in "the model of one thread": an id the backend
    // cannot resolve is dropped in silence, the question is answered by whatever
    // model was picked instead, and the client is told nothing. Same defect,
    // same number — repeated here because the consequence is not the same. In a
    // room the user can see the picker is pointing at a model that has gone away
    // and choose another; in an agent there is nothing to look at and nothing to
    // change, so every turn of every conversation in it silently runs on a model
    // neither the author nor the user chose.
    //
    // Reachable through a plain client, too: an agent built on a profile that is
    // later deleted leaves exactly this id in the composer's hands.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const [first] = twoTextProfiles(await aiChat.listProfiles("owner"));

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
      prompt: SHORT_ANSWER_PROMPT,
    });
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
      "the agent is bound to the first profile",
    ).toBe(first.id);
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest thread on the agent's own model",
      profileId: first.id,
      agentId,
    });

    const bad = await aiChat.sendMessage("owner", {
      threadId,
      profileId: UNRESOLVABLE_PROFILE_ID,
      agentId,
      message: "Reply with the single word OK.",
      timeoutMs: STREAM_CAP_MS,
    });

    // The thread was not corrupted — it neither took the unresolvable id nor
    // lost the agent's model. Asserted before the report, so a fix cannot land
    // on a suite that has stopped checking this.
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the thread stays on the agent's model",
    ).toBe(first.id);

    // The reply is only read while the send is accepted: a fix that refuses it
    // leaves nothing to wait for, and this has to report an unexpected pass
    // rather than time out here.
    if (bad.status === 200 && bad.streamError === undefined) {
      expectHealthyAssistantReply(
        await aiChat.waitForAssistantReply("owner", threadId),
      );
    }

    // Fix-agnostic: a 4xx, or an `error` frame inside the 200 the way a model
    // failure is reported. Only today's silent success fails.
    test.fail();
    expect(
      bad.status !== 200 || bad.streamError !== undefined,
      "a model choice the backend cannot resolve is reported, not dropped",
    ).toBe(true);
  });

  test("GET /api/2.0/ai/profiles/list - the catalogue is served whole inside an agent, for a member as well", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // What the API says about the hidden picker: nothing. The catalogue route
    // takes no entity scope at all, so there is no request a client can make
    // that means "I am in an agent, give me the models I may use here" — it
    // always answers the whole list, to the agent's author and to a member of
    // it alike. That is the documenting half of BUG 82914 / BUG 82915 above:
    // the fixation is drawn by the composer over a catalogue that never stopped
    // offering the alternatives, so anything not going through that composer has
    // them all.
    //
    // Green on purpose. Should the route ever start scoping itself, this is the
    // test that says so, and the two BUG tests above become the fix.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await aiChat.listProfiles("owner");
    const [first, second] = twoTextProfiles(catalogue);

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Fixed Model Agent",
      profileId: first.id,
      prompt: SHORT_ANSWER_PROMPT,
    });
    expect(
      (await profiles.getAllAssignments("owner", agentId)).data?.Chat,
      "the agent is fixed on the first profile",
    ).toBe(first.id);

    // The agent's own model is in the list, and so is at least one other — the
    // list a hidden picker is hiding.
    const ids = catalogue.map((profile) => profile.id);
    expect(ids).toContain(first.id);
    expect(
      ids,
      "the model the agent was not built on is offered just the same",
    ).toContain(second.id);

    // A member of the agent — the user whose picker is hidden — reads the same
    // list. Compared as sets, since the order of the catalogue is not a
    // contract.
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await inviteToAgent(ownerApi.rooms, agentId, memberData.response!.id!);

    const memberCatalogue = await aiChat.getProfiles("user");
    expect(memberCatalogue.status).toBe(200);
    expect([...(memberCatalogue.data ?? [])].map((p) => p.id).sort()).toEqual(
      [...ids].sort(),
    );

    // And nothing in the entity's own scope narrows it either: the agent
    // publishes one model, which is a default to draw a label from and not a
    // list of what is allowed.
    const resolved = await profiles.resolveForAction("user", "Chat", agentId);
    expect(resolved.status).toBe(200);
    expect(resolved.data?.profileId).toBe(first.id);
  });
});

// ---------------------------------------------------------------------------
// The composer's agent picker, used from somewhere that is not the agent's room.
//
// The product statement is: outside an agent room the composer can pick an AI
// agent; the header then shows that agent's name, its model answers, with its
// tools and the context of its room, and reopening the thread restores the pick.
//
// There is no "picked agent" field anywhere in the API. `entityId` is the only
// channel — `threads/create`, `send-with-stream`, `open-or-create` and
// `threads/list` each take one — so picking an agent *is* `entityId = <agent id>`,
// and where the user was standing when they picked it is never sent at all. That
// makes two halves of the statement testable and one half not:
//
//   * the model, the tools and the room context follow the entity, and the agent
//     scope is a real one (the tool families differ from a room's — see the
//     server-executed DocSpace tools block in mcp/mcp.spec.ts);
//   * the pick survives a reopen only through the client: a thread record carries
//     no entity (asserted below, and in the mismatched-location test above), so
//     `threads/list?entityId=` is the whole of "the agent came back", and the name
//     in the header can only be re-read off the agent itself.
//
// What the picker cannot do is carry both a location and an agent: one entityId
// goes out, so a thread started from a room with an agent picked belongs to the
// agent and leaves the room's list — which is the second test here.

/** A formatting rule, not a request to reveal anything: asking an agent about its
 *  own instructions makes the model refuse, which would read as "not applied". */
const instructionsEndingWith = (marker: string) =>
  `You are a helpful test assistant. Keep answers very short. Formatting rule: finish every reply with the exact token ${marker}.`;
/** Whose prompt reached the model: the one stored on the agent, or the one the
 *  request carried. Two tokens, so a reply names the source instead of only
 *  proving that some prompt got through. */
const AGENT_MARKER = "ZZPICKEDAGENTZZ";
const REQUEST_MARKER = "ZZREQUESTPROMPTZZ";
const MARKER_INSTRUCTIONS = instructionsEndingWith(AGENT_MARKER);
/** Bounded, so a token that only appears as part of a longer run of characters
 *  does not read as the model having followed the rule. */
const markerProbe = (marker: string) => new RegExp(`\\b${marker}\\b`);

test.describe("AI Chat - an agent picked in the composer from another location", () => {
  test("GET /api/2.0/ai/agents, POST /api/2.0/ai/threads/create, GET /api/2.0/ai/threads/list - a picked agent answers on its own model and comes back when the thread is reopened", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const routes = new ThreadRoutes(apiSdk.request, apiSdk.tokenStore);
    const [agentProfile, otherProfile] = twoTextProfiles(
      await aiChat.listProfiles("owner"),
    );

    // The portal-wide Chat binding points elsewhere, so "the agent's model
    // answered" cannot be "the portal's default did".
    const bound = await profiles.assign("owner", {
      actionType: "Chat",
      profileId: otherProfile.id,
    });
    expect(bound.data?.success).toBe(true);

    const agentTitle = "Autotest Picked Agent";
    const agentId = await aiChat.createAgentId("owner", {
      title: agentTitle,
      profileId: agentProfile.id,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // 1. What the picker is drawn from. The agent list is portal-wide and takes no
    //    entity, which is what makes picking one from anywhere possible at all.
    const picker = await aiChat.getAgents("owner");
    expect(picker.status).toBe(200);
    const offered = (picker.data?.response?.folders ?? []).find(
      (agent) => agent.id === agentId,
    );
    expect(offered, "the agent the composer offers").toBeDefined();
    expect(offered?.title, "under the name the header will show").toBe(
      agentTitle,
    );

    // 2. And the model shown beside that name, read off the agent record.
    const info = await aiChat.getAgentInfo("owner", agentId);
    expect(info.status).toBe(200);
    expect(info.data?.response?.profileId).toBe(agentProfile.id);

    // 3. The pick itself: the entity is the agent, and a composer whose picker is
    //    hidden behind the agent sends no profileId of its own.
    const created = await routes.post("owner", "/api/2.0/ai/threads/create", {
      title: "Autotest picked-agent thread",
      entityId: String(agentId),
    });
    expect(created.status).toBe(200);
    const threadId = created.data?.threadId ?? "";
    expect(threadId).toBeTruthy();

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    // The agent's model is what answered and what the thread now carries.
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "the agent's model answered, not the portal-wide one",
    ).toBe(agentProfile.id);

    // 4. Reopening. The thread record does not name the agent — there is no field
    //    for it — so the list keyed on the entity is the whole restore path, and
    //    the header name has to be re-read off the agent.
    const record = await aiChat.getThread("owner", threadId);
    expect(
      Object.keys(record.data ?? {}),
      "a thread record still carries no entity field",
    ).not.toContain("entityId");

    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(
      listed.data.map((thread) => thread.threadId),
      "the thread is found again through the agent it was started under",
    ).toContain(threadId);

    const reopened = await aiChat.openOrCreateThread("owner", {
      threadId,
      profile: agentProfile,
      entityId: String(agentId),
      firstMessage: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });
    expect(reopened.status).toBe(200);
    expect(reopened.data?.threadId, "the same thread is reopened").toBe(
      threadId,
    );
    expect(
      reopened.data?.priorMessages,
      "with the conversation held with the agent",
    ).toHaveLength(2);
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "and still on the agent's model",
    ).toBe(agentProfile.id);
    expect(
      (await aiChat.getAgentInfo("owner", agentId)).data?.response?.title,
      "the name the reopened header is redrawn from",
    ).toBe(agentTitle);
  });

  test("GET /api/2.0/ai/threads/list - picking an agent moves the thread out of the room the composer was opened in", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // One entityId goes out with a thread, so the location and the pick cannot
    // both be carried. Picking an agent while looking at a room therefore takes
    // the conversation out of that room's list — a client that expects to find it
    // there afterwards will not.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const [agentProfile, otherProfile] = twoTextProfiles(
      await aiChat.listProfiles("owner"),
    );

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Picker Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Picked Agent",
      profileId: agentProfile.id,
      prompt: SHORT_ANSWER_PROMPT,
    });

    // Two threads from the same place: one with nothing picked, one with the
    // agent picked. The first is the positive control — an empty room list would
    // otherwise pass the absence check below on its own.
    const roomThreadId = await aiChat.createThreadId("owner", {
      title: "Autotest room thread",
      profileId: otherProfile.id,
      agentId: roomId,
    });
    const pickedThreadId = await aiChat.createThreadId("owner", {
      title: "Autotest picked-agent thread",
      profileId: agentProfile.id,
      agentId,
    });

    const roomList = await aiChat.listThreads("owner", roomId);
    expect(roomList.status).toBe(200);
    const roomThreadIds = roomList.data.map((thread) => thread.threadId);
    expect(
      roomThreadIds,
      "the thread started with nothing picked stays with the room",
    ).toContain(roomThreadId);
    expect(
      roomThreadIds,
      "the picked agent's thread is not listed for the room it was started from",
    ).not.toContain(pickedThreadId);

    const agentList = await aiChat.listThreads("owner", agentId);
    expect(agentList.status).toBe(200);
    const agentThreadIds = agentList.data.map((thread) => thread.threadId);
    expect(
      agentThreadIds,
      "it is listed for the agent that was picked",
    ).toContain(pickedThreadId);
    expect(
      agentThreadIds,
      "and the room's own thread did not follow the pick",
    ).not.toContain(roomThreadId);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a per-request prompt applies where no agent prompt competes with it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The control for the two tests below: `actionArgs.prompt` on an entity that
    // carries no instructions of its own — an ordinary room. Without it, "the
    // agent's prompt won" could equally be "the request's prompt goes nowhere at
    // all", and the marker probe itself would be unproven.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Prompt Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest instructed room thread",
      profileId,
      agentId: roomId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Hi there!",
      instructions: instructionsEndingWith(REQUEST_MARKER),
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);
    expect(
      AiAgentChat.assistantText(messages),
      "the prompt sent with the request reached the model",
    ).toMatch(markerProbe(REQUEST_MARKER));
  });

  test("BUG 83236: POST /api/2.0/ai/ai/send-with-stream - a per-request prompt replaces the picked agent's own AI Instructions", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Now that the backend applies the agent's stored prompt by itself (the test
    // below), `actionArgs.prompt {mode:"replace"}` has something to replace — and
    // it does not: measured 2026-08-18, the reply follows the agent's marker and
    // never the request's. The documented per-request override is silently
    // dropped for an agent entity, while it works on a room (the control above),
    // so a composer offering "instructions for this message" against a picked
    // agent changes nothing and says nothing.
    //
    // Two markers rather than one, so the reply names the prompt that won instead
    // of only showing that some prompt did.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Instructed Agent",
      profileId,
      prompt: MARKER_INSTRUCTIONS,
    });
    expect(
      await aiChat.getAgentInstructions("owner", agentId),
      "the agent holds the instructions the request is about to override",
    ).toBe(MARKER_INSTRUCTIONS);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest instructed thread",
      profileId,
      agentId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Hi there!",
      instructions: instructionsEndingWith(REQUEST_MARKER),
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);
    const text = AiAgentChat.assistantText(messages);

    test.fail();
    expect(
      {
        request: markerProbe(REQUEST_MARKER).test(text),
        agent: markerProbe(AGENT_MARKER).test(text),
      },
      "the request's prompt replaced the agent's stored one",
    ).toEqual({ request: true, agent: false });
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a picked agent answers under the AI Instructions stored on it", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // "Its model answers" includes the agent's own AI Instructions, and a composer
    // that only knows the agent's id has nothing else to send: the send carries no
    // actionArgs at all here.
    //
    // This was not always so. Measured on 2026-07-30 the backend ignored
    // chatSettings.prompt entirely and the client had to re-send it per request;
    // as of 2026-08-18 the stored prompt reaches the model on its own (three runs,
    // three passes). Model non-compliance would fail this test too — the paired
    // test above is what rules that out, since a prompt that arrives by the other
    // route still produces its marker.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Instructed Agent",
      profileId,
      prompt: MARKER_INSTRUCTIONS,
    });
    expect(
      await aiChat.getAgentInstructions("owner", agentId),
      "the agent really holds the instructions under test",
    ).toBe(MARKER_INSTRUCTIONS);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest instructed thread",
      profileId,
      agentId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Hi there!",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);
    expect(
      AiAgentChat.assistantText(messages),
      "the agent answered under its own stored instructions",
    ).toMatch(markerProbe(AGENT_MARKER));
  });
});

// ---------------------------------------------------------------------------
// An AI room made through the rooms API instead of the agent factory.
//
// `RoomType.AiRoom` (9) is accepted by POST /files/rooms, which gives a second
// way to end up with a room a client would treat as an agent — and it is not the
// same object. Measured 2026-08-06: the room comes back with roomType 9,
// `security.UseChat`/`CanUseAi` true and an empty `chatSettings`, and threads in
// it work, but it has no model of its own and it is missing from the agent list.
// So the two halves of "an agent room" — the room type the client hides the
// picker on, and the Chat binding the picker would have been hidden in favour of
// — come apart on this path.

test.describe("AI Chat - an AI room created through the rooms API", () => {
  test("POST /api/2.0/files/rooms - a roomType 9 room has no model of its own and is absent from the agent list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    // The reference object: an agent made the intended way, in the same portal.
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Reference Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });

    const created = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms API AI Room",
        roomType: RoomType.AiRoom,
      },
    });
    expect(created.status).toBe(200);
    expect(created.data.response?.roomType).toBe(RoomType.AiRoom);
    const aiRoomId = created.data.response!.id!;
    // Nothing was carried over from the agent factory: no prompt, no model.
    expect(created.data.response?.chatSettings?.prompt).toBeUndefined();

    // The agents list does not have it, though the agent read answers for it.
    const agents = await aiChat.getAgents("owner");
    expect(agents.status).toBe(200);
    const listedIds = agents.data?.response?.folders?.map((agent) => agent.id);
    expect(listedIds, "the reference agent is listed").toContain(agentId);
    expect(listedIds, "the rooms-API AI room is not").not.toContain(aiRoomId);

    const info = await aiChat.getAgentInfo("owner", aiRoomId);
    expect(info.status).toBe(200);
    expect(info.data?.response?.roomType).toBe(RoomType.AiRoom);
    // …and answers without the model field a real agent carries there.
    expect(info.data?.response?.profileId).toBeUndefined();
    expect(
      (await aiChat.getAgentInfo("owner", agentId)).data?.response?.profileId,
      "the reference agent does carry one",
    ).toBe(profileId);

    // No Chat binding, and — unlike every other entity — not even the
    // portal-wide fallback: the scope of a roomType 9 room comes back empty.
    // Both other scopes are read here so "empty" cannot be this route answering
    // empty for everything.
    const roomScope = await profiles.getAllAssignments("owner", aiRoomId);
    expect(roomScope.status).toBe(200);
    expect(roomScope.data).toEqual({});

    const agentScope = await profiles.getAllAssignments("owner", agentId);
    expect(agentScope.data?.Chat).toBe(profileId);

    const { data: custom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Custom Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const customScope = await profiles.getAllAssignments(
      "owner",
      custom.response!.id!,
    );
    expect(
      customScope.data?.Default,
      "an ordinary room falls back to the portal-wide scope",
    ).toBeTruthy();

    // A chat in it is therefore answered by the portal-wide Default, exactly as
    // in an ordinary room — a client that hid its picker on the room type has
    // nothing of the room's to hide it in favour of.
    const portalDefault = (await profiles.getAllAssignments("owner")).data
      ?.Default;
    expect(portalDefault).toBeTruthy();
    const resolved = await profiles.resolveForAction("owner", "Chat", aiRoomId);
    expect(resolved.data?.profileId).toBe(portalDefault);

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest AI room thread",
      profileId,
      agentId: aiRoomId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      agentId: aiRoomId,
      message: "Reply with the single word OK.",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );
    // The thread keeps the model it was opened on rather than the room's, which
    // is the point: the room has none to impose. What the room resolves to is
    // the portal default, asserted above — a client that hid its picker on the
    // room type has nothing of the room's to hide it in favour of.
    expect(portalDefault).not.toBe(profileId);
    expect(
      (await aiChat.getThread("owner", threadId)).data?.profileId,
      "no model of the room's overrode the thread's own",
    ).toBe(profileId);
  });

  test("GET /api/2.0/ai/threads/list - a roomType 9 room scopes its threads the way an agent does", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The one thing this room does get right. Measured 2026-08-13: a roomType 9
    // room made through /files/rooms has a thread list of its own, both ways —
    // its threads stay in it, and the shared bucket every other entity lists
    // (BUG 82855) does not reach into it. So the scoping is keyed on the AI room
    // type rather than on having gone through the agent factory, which is why
    // this room is scoped while being absent from the agent list, carrying no
    // model and having an empty assignment scope (the test above).
    //
    // Worth pinning as its own contract: this room is the only entity that is
    // scoped without being an agent, so a future change to how non-agent scope
    // is resolved (BUG 82855 is closed as by-design, but the resolution logic
    // could still move) could easily drop it back into the bucket, and nothing
    // else in the suite would notice.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest AI Room Control Agent",
      profileId,
    });
    const { data: aiRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Rooms API AI Room Scope",
        roomType: RoomType.AiRoom,
      },
    });
    const aiRoomId = aiRoom.response!.id!;
    const { data: other } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Unrelated Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const otherRoomId = other.response!.id!;

    const inAiRoom = await aiChat.createThreadId("owner", {
      title: "Autotest thread in the rooms-API AI room",
      profileId,
      agentId: aiRoomId,
    });
    const inAgent = await aiChat.createThreadId("owner", {
      title: "Autotest thread in the real agent",
      profileId,
      agentId,
    });
    // The thread that proves the bucket is populated: an ordinary room's thread
    // is the one every unscoped entity lists. Without it, "the AI room lists
    // only its own" would also pass on a portal where the bucket happens to be
    // empty.
    const inOtherRoom = await aiChat.createThreadId("owner", {
      title: "Autotest thread in an ordinary room",
      profileId,
      agentId: otherRoomId,
    });

    // The AI room holds exactly its own conversation: neither the agent's thread
    // nor the ordinary room's reaches it.
    const ownList = await aiChat.listThreads("owner", aiRoomId);
    expect(ownList.status).toBe(200);
    expect(ownList.data.map((thread) => thread.threadId)).toEqual([inAiRoom]);

    // And its conversation does not leak the other way, into the shared bucket
    // or into the real agent.
    const unrelated = await aiChat.listThreads("owner", otherRoomId);
    expect(unrelated.status).toBe(200);
    const bucket = unrelated.data.map((thread) => thread.threadId);
    expect(bucket, "the shared bucket is not empty").toContain(inOtherRoom);
    expect(
      bucket,
      "the AI room's thread is not in the shared bucket",
    ).not.toContain(inAiRoom);

    const agentList = await aiChat.listThreads("owner", agentId);
    expect(agentList.status).toBe(200);
    expect(agentList.data.map((thread) => thread.threadId)).toEqual([inAgent]);
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

/** The one request every test in this block makes, so they differ in nothing else. */
const PICTURE_REQUEST =
  "Generate an image of a red circle on a white background.";

/**
 * How long a generated picture is given to appear in the folder it should be
 * saved into. Nothing lands there while BUG 82861 is open, so this is time each
 * of the saving tests spends waiting in full — kept short deliberately.
 */
const PICTURE_SAVE_MS = 30000;

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif)$/i;

type RoleApi = ReturnType<ApiSDK["forRole"]>;

/**
 * Asks for a picture in a thread of its own and reads the thread back.
 *
 * The request is capped: a drawing attempt never terminates while BUG 82861 is
 * open, so the durable evidence is what the thread holds and not the frames.
 * `finished` is returned rather than swallowed — it is what tells "the model
 * answered" apart from "the model is still hanging", and a test that asserts
 * the first would otherwise pass on the second.
 */
async function requestPicture(
  aiChat: AiAgentChat,
  role: AgentRole,
  agentId: number,
  profileId: string,
  title: string,
) {
  const threadId = await aiChat.createThreadId(role, {
    title,
    profileId,
    agentId,
  });

  let finished = false;
  try {
    await aiChat.sendMessage(role, {
      threadId,
      profileId,
      agentId,
      message: PICTURE_REQUEST,
      timeoutMs: STREAM_CAP_MS,
    });
    finished = true;
  } catch {
    // The stream did not terminate within the cap; the thread is read below.
  }

  const messages = await aiChat.readMessages(role, threadId);
  expect(messages.status, `reading "${title}" back`).toBe(200);
  const reply = AiAgentChat.assistantMessages(messages.data)[0];
  expect(reply, `the reply in "${title}" is stored`).toBeDefined();

  return {
    threadId,
    finished,
    reply,
    toolNames: AiAgentChat.toolCalls(reply).map((call) => call.toolName),
  };
}

/** Ids of everything currently in a folder, as the baseline for "a file appeared". */
async function fileIdsIn(api: RoleApi, folderId: number): Promise<Set<number>> {
  return new Set((await listFolderFiles(api, folderId)).map((file) => file.id));
}

/**
 * Waits for a file that was not in `known` to turn up in the folder.
 *
 * Matched on ids rather than on a count or on a name: the picture's file name
 * is the server's to choose, and a count also grows when something unrelated is
 * written into the same folder. Returns `undefined` on timeout, so the caller
 * decides whether an absence is the expected outcome.
 */
async function waitForNewFile(
  api: RoleApi,
  folderId: number,
  known: Set<number>,
  timeoutMs = PICTURE_SAVE_MS,
): Promise<{ id: number; title: string } | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const fresh = (await listFolderFiles(api, folderId)).find(
      (file) => !known.has(file.id),
    );
    if (fresh || Date.now() > deadline) return fresh;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

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

    // …which is the engine's own: no client offered it, and the tools API does
    // not advertise it — nor anything else, the catalogue publishes nothing at
    // all now (see the system tools block in mcp.spec.ts).
    const system = await aiTools.listSystemTools("owner");
    expect(
      Object.values(system.data ?? {}).flatMap((tools) =>
        (tools ?? []).map((tool) => tool.name),
      ),
      "generate_image is server-side, not an advertised DocSpace tool",
    ).not.toContain("generate_image");

    // What comes back for the call is an empty picture, so the answer has
    // nothing to carry on with; the reply is left `cancelled` by our own cap
    // rather than finished by the backend.
    const drawing = calls.find((call) => call.toolName === "generate_image")!;
    expect(drawing.result, "an empty picture came back").toContain(
      '"base64":""',
    );
    expect(reply.status?.type).toBe("incomplete");
    expect(reply.status?.reason).toBe("cancelled");

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
    //
    // Staged in a room: pointing a thread at a profile of one's choosing is what
    // a room allows, so the failure below is the image model refusing the work
    // rather than the agent-override bug from the block above.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const imageProfile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.imageOnly,
    );

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Image Profile Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const agentId = room.response!.id!;
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

  // -------------------------------------------------------------------------
  // "Available when Model Assignment has an image model; with no such model the
  // generation is off and the tool is not offered to the model."
  //
  // The second half is not directly observable: `generate_image` is the
  // engine's own and is absent from `list-system-tools` in every configuration
  // (asserted in the hang test above), so "the tool is not offered" has no
  // reading of its own over the API. What is asserted instead is its only
  // visible consequence — whether the model reaches for the tool at all.
  //
  // Both states are exercised in one test on purpose. "No `generate_image`
  // call" on its own also describes a model that answered in prose, a portal
  // where inference is dead, and a request the gateway refused, so the same
  // request with the binding in place runs first as the positive control.
  //
  // BUG 83137 (fixed): the portal's *seeded* ImageGeneration binding used to
  // survive `unassign` — it answered 200 `{success:true}` while get-assignment
  // / get-all-assignments / resolve-for-action kept naming the same image
  // profile. `unassign` now actually clears it, so the second half below
  // (drawing with no image model bound) is reachable.
  test("DELETE /api/2.0/ai/assignments/unassign - the portal's seeded ImageGeneration model can be taken away", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Image Binding Agent",
      profileId,
    });

    // The premise the control rests on: an image model really is bound.
    const bound = await profiles.getAssignment("owner", "ImageGeneration");
    expect(
      bound.data,
      "the portal starts with a model behind ImageGeneration",
    ).toBeTruthy();

    const withModel = await requestPicture(
      aiChat,
      "owner",
      agentId,
      profileId,
      "Autotest picture with a model",
    );
    expect(
      withModel.toolNames,
      "with an image model bound the request does reach generate_image",
    ).toContain("generate_image");

    // Take the image model away…
    const removed = await profiles.unassign("owner", {
      actionType: "ImageGeneration",
    });
    expect(removed.status).toBe(200);
    expect(removed.data?.success, removed.data?.error?.message).toBe(true);

    // …and the binding is gone from the route that lists it as well, so this
    // is the stored state and not one stale reader.
    expect(
      (await profiles.getAllAssignments("owner")).data?.ImageGeneration,
      "get-all-assignments no longer lists the model unassign removed",
    ).toBeFalsy();
    expect(
      (await profiles.getAssignment("owner", "ImageGeneration")).data,
    ).toBeNull();

    // …and confirm that leaves the portal in the state the requirement talks
    // about. `ImageGeneration` still resolves — through `Default` — so the
    // question is not whether it resolves but whether what it resolves to can
    // draw. If a drawing model were still reachable here the run below would be
    // testing nothing.
    const resolved = await profiles.resolveForAction(
      "owner",
      "ImageGeneration",
    );
    expect(resolved.status).toBe(200);
    expect(
      resolved.data?.profile?.capabilities,
      "no model that can draw is left behind ImageGeneration",
    ).not.toBe(AI_CAPS.imageOnly);

    const withoutModel = await requestPicture(
      aiChat,
      "owner",
      agentId,
      profileId,
      "Autotest picture without a model",
    );

    expect(
      withoutModel.toolNames,
      "no image model is configured, so nothing should call the drawing tool",
    ).not.toContain("generate_image");

    // And the user is answered rather than left on a stream that never ends:
    // a disabled feature has to say so, which is the difference between this
    // and BUG 82861. Whether the model's own reply text is non-empty is not
    // asserted here — that flaps on its own (model nondeterminism), separate
    // from the drawing behaviour this test is about.
    expect(
      withoutModel.finished,
      `the reply completed within ${STREAM_CAP_MS} ms`,
    ).toBe(true);
  });

  // -------------------------------------------------------------------------
  // "The picture is saved automatically into the current section (where the
  // user may write) or else into My Documents."
  //
  // Three tests, one per destination the rule can pick. All three are
  // `test.fail` for the same reason: BUG 82861 leaves `generate_image`
  // unresolved, so no picture is ever produced and nothing can land anywhere.
  // Each asserts that the drawing really was attempted *before* `test.fail()`,
  // so when the hang is fixed these report an unexpected pass for the right
  // reason rather than because the request quietly stopped being made.
  //
  // The landing folder is matched on file ids taken before the request, not on
  // a name: the picture's file name is the server's to choose.

  test("BUG 82861: POST /api/2.0/ai/ai/send-with-stream - a picture generated in an agent chat is not saved into its Result Storage", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // An agent room is the one "current section" a chat has by default, and its
    // root takes no files at all (`security.Create:false`, 403 even for the
    // Owner) — Result Storage is where everything the agent produces is filed,
    // exports included. So that, not the room id, is where the picture belongs.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Picture Storage Agent",
      profileId,
    });

    const resultStorageId = await agentStorageFolderId(
      ownerApi,
      agentId,
      FolderType.ResultStorage,
    );
    const { data: myDocs } = await ownerApi.folders.getMyFolder();
    const myDocsId = myDocs.response!.current!.id!;

    const storedBefore = await fileIdsIn(ownerApi, resultStorageId);
    const myDocsBefore = await fileIdsIn(ownerApi, myDocsId);

    const attempt = await requestPicture(
      aiChat,
      "owner",
      agentId,
      profileId,
      "Autotest picture into an agent",
    );
    expect(
      attempt.toolNames,
      "the drawing was attempted — without this the rest proves nothing",
    ).toContain("generate_image");

    test.fail();
    const landed = await waitForNewFile(
      ownerApi,
      resultStorageId,
      storedBefore,
    );
    expect(landed, "the picture is filed next to the agent").toBeDefined();
    expect(landed!.title).toMatch(IMAGE_EXTENSION);

    // The chat had a section of its own, so personal documents are not where it
    // may fall back to.
    const strayInMyDocs = (await listFolderFiles(ownerApi, myDocsId)).filter(
      (file) => !myDocsBefore.has(file.id),
    );
    expect(
      strayInMyDocs.map((file) => file.title),
      "nothing was filed in My Documents instead",
    ).toEqual([]);
  });

  test("BUG 82861: POST /api/2.0/ai/ai/send-with-stream - a picture generated in a room chat is not saved into that room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The other kind of "current section": a chat opened against an ordinary
    // room, whose root the owner may write to. `POST /files/{folderId}/file` is
    // the oracle for that right — it is asserted rather than assumed, so a
    // picture that never arrives cannot be explained by a folder that would
    // have refused it anyway.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Picture Destination Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const probe = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Write Probe" },
    });
    expect(probe.status, "the owner may write into this room").toBe(200);

    const { data: myDocs } = await ownerApi.folders.getMyFolder();
    const myDocsId = myDocs.response!.current!.id!;

    const roomBefore = await fileIdsIn(ownerApi, roomId);
    const myDocsBefore = await fileIdsIn(ownerApi, myDocsId);

    const attempt = await requestPicture(
      aiChat,
      "owner",
      roomId,
      profileId,
      "Autotest picture into a room",
    );
    expect(
      attempt.toolNames,
      "the drawing was attempted — without this the rest proves nothing",
    ).toContain("generate_image");

    test.fail();
    const landed = await waitForNewFile(ownerApi, roomId, roomBefore);
    expect(
      landed,
      "the picture is saved into the room the chat is in",
    ).toBeDefined();
    expect(landed!.title).toMatch(IMAGE_EXTENSION);

    const strayInMyDocs = (await listFolderFiles(ownerApi, myDocsId)).filter(
      (file) => !myDocsBefore.has(file.id),
    );
    expect(
      strayInMyDocs.map((file) => file.title),
      "the writable section was used, not the personal fallback",
    ).toEqual([]);
  });

  test("BUG 82861: POST /api/2.0/ai/ai/send-with-stream - a picture generated by a member who cannot write to the room is not saved into My Documents", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The "(where the user may write)" half. A Read-level member is the one
    // case where the current section is not a legal destination, so the rule's
    // fallback is the whole of what is under test here.
    //
    // The member is created and used last: authenticating as the owner after
    // they have a token makes their calls run as the owner and fabricates a
    // pass.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Read Only Picture Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;
    const { status: inviteStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });
    expect(inviteStatus, "the member really is in the room").toBe(200);

    const memberApi = apiSdk.forRole("user");

    // The premise: the room is closed to them for writing. Without this the
    // fallback below would be indistinguishable from the room simply not being
    // tried.
    const probe = await memberApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Member Write Probe" },
    });
    expect(probe.status, "a Read member may not write into the room").toBe(403);

    const { data: memberDocs } = await memberApi.folders.getMyFolder();
    const memberDocsId = memberDocs.response!.current!.id!;

    const memberDocsBefore = await fileIdsIn(memberApi, memberDocsId);
    const roomBefore = await fileIdsIn(ownerApi, roomId);

    const attempt = await requestPicture(
      aiChat,
      "user",
      roomId,
      profileId,
      "Autotest picture by a read-only member",
    );
    expect(
      attempt.toolNames,
      "the drawing was attempted — without this the rest proves nothing",
    ).toContain("generate_image");

    test.fail();
    const landed = await waitForNewFile(
      memberApi,
      memberDocsId,
      memberDocsBefore,
    );
    expect(
      landed,
      "the picture falls back to the member's own documents",
    ).toBeDefined();
    expect(landed!.title).toMatch(IMAGE_EXTENSION);

    // And nothing was forced into the room they may not write to.
    const strayInRoom = (await listFolderFiles(ownerApi, roomId)).filter(
      (file) => !roomBefore.has(file.id),
    );
    expect(
      strayInRoom.map((file) => file.title),
      "nothing was written into the room the member cannot write to",
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Changing a thread while the model is still writing into it — the race a user
// creates by renaming, clearing or deleting a chat mid-reply.
//
// The window used to be opened with `sendAndAbort`, back when hanging up did
// not stop the generation and the backend kept writing for another twenty
// seconds. Since 2026-08-18 the disconnect IS honoured (see the stop block in
// messages.spec.ts): the reply is stored `incomplete`/`cancelled` and empty, so
// an aborted send leaves nothing in flight and there is no race left to test.
//
// The window is therefore held open instead of hung up on: the send is started
// and NOT awaited, the mutation is issued a few seconds in, and the send is
// awaited afterwards.

/** How long a late write is given to show up after the stream has ended. */
const GENERATION_WINDOW_MS = 20000;

/** Long enough that the reply is certainly still being written at the cut. */
const RACE_PROMPT =
  "Write a detailed essay of at least 600 words about the history of typography. " +
  "Number every paragraph.";

const RACE_CUT_MS = 5000;

async function settleGeneration(ms = GENERATION_WINDOW_MS) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts a reply and hands back control `RACE_CUT_MS` in, while the model is
 * still writing it and the connection is still open.
 *
 * `stillWriting()` is the control every test in this block needs: a mutation is
 * only a mid-reply mutation if the send had not finished when it was issued,
 * and a test that skipped this would keep passing against a build that answers
 * instantly. It is the only evidence available — a partial reply cannot be read
 * through the API while the stream is open, `read-messages` returns no
 * assistant message at all until the stream ends.
 */
async function startReply(
  aiChat: AiAgentChat,
  body: { threadId: string; profileId: string; agentId: number },
) {
  let done = false;
  const inFlight = aiChat
    .sendMessage("owner", { ...body, message: RACE_PROMPT })
    .finally(() => {
      done = true;
    });

  await new Promise((resolve) => setTimeout(resolve, RACE_CUT_MS));
  return { inFlight, stillWriting: () => !done };
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

    const { inFlight, stillWriting } = await startReply(aiChat, {
      threadId,
      profileId,
      agentId,
    });

    const renamed = await aiChat.renameThread(
      "owner",
      threadId,
      "Autotest renamed mid-reply",
    );
    expect(
      stillWriting(),
      "the reply was still being written when the rename landed",
    ).toBe(true);
    expect(renamed.status).toBe(200);

    // The reply lands after the rename; neither write loses to the other.
    const sent = await inFlight;
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
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

    const { inFlight, stillWriting } = await startReply(aiChat, {
      threadId: doomed,
      profileId,
      agentId,
    });

    const deleted = await aiChat.deleteThread("owner", doomed);
    expect(
      stillWriting(),
      "the reply was still being written when the thread was deleted",
    ).toBe(true);
    expect(deleted.status).toBe(200);

    // Losing the thread under it ends the stream: the reply that was on its way
    // comes back as an error frame instead of a message.
    const sent = await inFlight;
    expect(sent.status).toBe(200);
    expect(sent.frames.map((frame) => frame.type)).toContain("error");
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

    const { inFlight, stillWriting } = await startReply(aiChat, {
      threadId,
      profileId,
      agentId,
    });

    const cleared = await aiChat.clearThreadMessages("owner", threadId);
    expect(
      stillWriting(),
      "the reply was still being written when the thread was cleared",
    ).toBe(true);
    expect(cleared.status).toBe(200);

    await inFlight;
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

// ---------------------------------------------------------------------------
// What happens in a chat when the model call itself fails — a wrong key, a model
// that cannot serve the request, a limit, a reply that never arrives — and
// whether the failure is something a client can put in front of a user in their
// own language. Measured against a live portal on 2026-08-12.
//
// The shape of an in-chat failure. The send is HTTP 200 either way; the failure
// arrives as the terminal frame of the stream and is stored in the thread as an
// assistant message with empty content plus
//
//   status: { type: "incomplete", reason: "error",
//             error: { code: "model_not_found", message: "400 model is not a chat model" } }
//
// so `error.code` is the machine-readable half a client can localise by, and
// `error.message` is the upstream string, verbatim.
//
// Which failures an API test can actually provoke on the gateway portal, and how:
//
//   provider refuses the credentials  the AI Tools wallet service is not paid for
//                                     -> code "auth", "403 AI Gateway is not enabled"
//   model cannot serve the request    an image profile driven as a chat model
//                                     -> code "model_not_found"
//   a limit is exceeded               a body past the request-size limit -> HTTP 413
//   no reply at all                   a request for an image: the stream never ends
//
// And what is NOT reachable, so nobody looks for it here later:
//
//   * A wrong API key cannot be configured. The portal runs the built-in
//     "ONLYOFFICE AI" gateway and its profiles are read-only (create/update
//     answer 403), so the credential failure has to be staged through the wallet
//     gate above. The key-validation surface itself does answer on a bad key —
//     `POST /ai/profiles/list-provider-models` with a wrong one is 400
//     `{"error":"Invalid API key for the AI provider"}` — and lives in
//     profiles.spec.ts.
//   * A provider rate limit. Six sends fired in parallel on six threads all
//     answered normally; nothing on the portal side rate-limits inference, and
//     the gateway's own limit is not reachable at a volume a test may use.
//   * The provider's context-length error. The reverse proxy answers 413 for a
//     500 KB body, well before any model's context window is in play, so the
//     "limit exceeded" case an API test can see is the proxy's, not the model's.
//   * A provider timeout as such. The observable equivalent is the request for an
//     image, whose stream never terminates (BUG 82861).
//
// One more thing measured on the way and deliberately left without a test: a
// well-formed but *unknown* profileId GUID is not treated as a failure at all —
// the send is answered normally by the model the thread already had, and nothing
// says the model that was asked for does not exist. Whether that is resilience
// or a silent substitution is a product question, so it is recorded here rather
// than asserted; the unparseable GUID below is the case that is unambiguously
// broken.

/** Past the reverse proxy's request-size limit — 500 KB is already refused. */
const OVERSIZED_MESSAGE = "word ".repeat(400000);

type PortalError = { error?: { message?: string } };

/**
 * The message of an ordinary portal error, in whatever language the caller's
 * profile is set to.
 *
 * This is the control for every localisation test here: it is a message the
 * portal does translate, so a test can tell "the AI message is not localised"
 * apart from "the culture switch did not take effect". Without it, a test
 * comparing two identical English AI messages would pass just as happily on a
 * portal where changing the culture does nothing at all.
 */
async function portalErrorMessage(apiSdk: ApiSDK): Promise<string> {
  const response = await apiSdk.request.get(
    `${apiSdk.tokenStore.portalBaseUrl}/api/2.0/files/file/99999999`,
    {
      headers: {
        Authorization: `Bearer ${apiSdk.tokenStore.getToken("owner")}`,
        Origin: `http://${apiSdk.tokenStore.newTenantDomain}`,
      },
    },
  );
  expect(response.status(), "GET /files/file/{missing} as the control").toBe(
    404,
  );
  const message = ((await response.json()) as PortalError).error?.message;
  expect(message, "the control error carries a message").toBeTruthy();
  return message as string;
}

/** Switches the caller's profile language and proves the portal kept it. */
async function setProfileCulture(
  ownerApi: ReturnType<ApiSDK["forRole"]>,
  userId: string,
  cultureName: string,
) {
  const { status, data } = await ownerApi.profiles.updateMemberCulture({
    userid: userId,
    culture: { cultureName },
  });
  expect(status, `PUT /people/${userId}/culture {${cultureName}}`).toBe(200);
  expect(
    data.response?.cultureName,
    "the culture read back from the profile",
  ).toBe(cultureName);
}

test.describe("AI Chat - a provider failure lands in the thread", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - the provider refuses the request and the thread carries on once it stops refusing", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The whole requirement in one thread: the refused turn is reported rather
    // than lost, and the *same* thread — not a fresh one — is still a working
    // conversation afterwards, history and context included.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await configureAiToolsAsUnpaid(ownerApi);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Provider Failure Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest failure thread",
      profileId,
      agentId,
    });

    const CODEWORD = "TULIP";
    const question = `Remember the codeword ${CODEWORD}. Reply with the single word OK.`;
    const refused = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: question,
    });
    expect(refused.status).toBe(200);
    expect(AiAgentChat.frameTypes(refused.text)).toContain(
      "message-incomplete",
    );

    const failedTurn = await aiChat.waitForAssistantReply(
      "owner",
      threadId,
      60000,
    );

    // The failure is reported as a failure — not as an empty answer, and not as
    // a silent one: type, reason, a code to translate by and a message to fall
    // back on are all there.
    const failure = AiAgentChat.assistantStatus(failedTurn);
    expect(failure?.type).toBe("incomplete");
    expect(failure?.reason).toBe("error");
    expect(failure?.error?.code).toBe("auth");
    expect(failure?.error?.message?.length ?? 0).toBeGreaterThan(0);
    expect(AiAgentChat.assistantText(failedTurn)).toBe("");

    // The question survived it.
    const asked = AiAgentChat.userMessages(failedTurn);
    expect(asked).toHaveLength(1);
    expect(AiAgentChat.messageText(asked[0])).toBe(question);

    // And the thread is still an ordinary thread: readable, listed and editable.
    const read = await aiChat.getThread("owner", threadId);
    expect(read.status).toBe(200);
    expect(read.data?.threadId).toBe(threadId);

    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toContain(threadId);

    const renamed = await aiChat.renameThread(
      "owner",
      threadId,
      "Renamed after the failure",
    );
    expect(renamed.status).toBe(200);
    expect((await aiChat.getThread("owner", threadId)).data?.title).toBe(
      "Renamed after the failure",
    );

    // Remove the cause and ask again in the same thread. The codeword is only
    // available from the turn that failed, so an answer that knows it proves the
    // failed turn stayed in the model's context rather than being dropped.
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const recovery = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message:
        "Which codeword did I ask you to remember? Answer with that word only.",
    });
    expect(recovery.streamError).toBeUndefined();
    expect(recovery.status).toBe(200);

    const settled = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      2,
      120000,
    );
    const replies = AiAgentChat.assistantMessages(settled);
    expect(replies).toHaveLength(2);
    expect(AiAgentChat.userMessages(settled)).toHaveLength(2);

    // The failed reply is still in the history — recovering did not rewrite it.
    expect(replies[0].status?.error?.code).toBe("auth");
    expect(AiAgentChat.messageText(replies[0])).toBe("");

    // The new one is a real answer, and it read the failed turn's question.
    expect(replies[1].status?.error).toBeUndefined();
    expect(AiAgentChat.messageText(replies[1])).toContain(CODEWORD);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a model that cannot serve the request fails the reply, and another model answers in the same thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // "Model unavailable", staged the only way the gateway allows: an
    // image-generation profile asked to hold a conversation. A room is used
    // rather than an agent because a room lets the caller choose the model per
    // send, which is what the recovery half needs — an agent's model is fixed.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const catalogue = await profiles.catalogue("owner");
    const imageProfile = AiProfiles.byCapabilities(
      catalogue,
      AI_CAPS.imageOnly,
    );
    const [textProfile] = twoTextProfiles(catalogue);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Provider Failure Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest unavailable model thread",
      profileId: imageProfile.id,
      agentId: roomId,
    });

    const question = "Reply with the single word OK.";
    const refused = await aiChat.sendMessage("owner", {
      threadId,
      profileId: imageProfile.id,
      agentId: roomId,
      message: question,
    });
    expect(refused.status).toBe(200);
    expect(AiAgentChat.frameTypes(refused.text)).toContain(
      "message-incomplete",
    );

    const failedTurn = await aiChat.waitForAssistantReply("owner", threadId);
    const failure = AiAgentChat.assistantStatus(failedTurn);
    expect(failure?.type).toBe("incomplete");
    expect(failure?.reason).toBe("error");
    expect(failure?.error?.code).toBe("model_not_found");
    expect(failure?.error?.message?.length ?? 0).toBeGreaterThan(0);
    expect(AiAgentChat.assistantText(failedTurn)).toBe("");
    expect(
      AiAgentChat.messageText(AiAgentChat.userMessages(failedTurn)[0]),
    ).toBe(question);

    // Picking a model that can answer is all it takes — same thread, no reset.
    const retried = await aiChat.sendMessage("owner", {
      threadId,
      profileId: textProfile.id,
      agentId: roomId,
      message: question,
    });
    expect(retried.streamError).toBeUndefined();
    expect(retried.status).toBe(200);

    const settled = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      2,
      120000,
    );
    const replies = AiAgentChat.assistantMessages(settled);
    expect(replies).toHaveLength(2);
    expect(replies[0].status?.error?.code).toBe("model_not_found");
    expect(replies[1].status?.error).toBeUndefined();
    expect(AiAgentChat.messageText(replies[1]).length).toBeGreaterThan(0);
    expect(AiAgentChat.userMessages(settled)).toHaveLength(2);
  });

  test("POST /api/2.0/ai/ai/regenerate-stream - regenerating a failed reply reports the same failure and keeps the thread", async ({
    apiSdk,
  }) => {
    // The gesture a user makes next: "try again". While the provider is still
    // refusing, the retry has to come back as the same reported failure — not as
    // a 500, and not as a thread that loses its history.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await configureAiToolsAsUnpaid(ownerApi);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Retry Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest retry thread",
      profileId,
      agentId,
    });

    await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Say hi",
    });
    const failedTurn = await aiChat.waitForAssistantReply(
      "owner",
      threadId,
      60000,
    );
    expect(AiAgentChat.assistantStatus(failedTurn)?.error?.code).toBe("auth");

    const again = await aiChat.regenerateStream("owner", {
      threadId,
      entityId: String(agentId),
      profileId,
    });
    expect(again.status).toBe(200);
    expect(AiAgentChat.frameTypes(again.text)).toContain("message-incomplete");
    expect(AiAgentChat.streamFrames(again.text)[0]?.message?.status).toEqual(
      expect.objectContaining({
        reason: "error",
        error: expect.objectContaining({ code: "auth" }),
      }),
    );

    // The question is still there and the thread did not gain a second one.
    const after = await aiChat.readMessages("owner", threadId);
    expect(after.status).toBe(200);
    const asked = AiAgentChat.userMessages(after.data);
    expect(asked).toHaveLength(1);
    expect(AiAgentChat.messageText(asked[0])).toBe("Say hi");
  });
});

test.describe("AI Chat - a failure the chat cannot show", () => {
  test('BUG 83045: POST /api/2.0/ai/ai/send-with-stream - a profileId the backend cannot parse answers a bare "stream error"', async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Every failure above arrives with a code. This one does not: a `profileId`
    // that is not a GUID gets HTTP 200 whose entire body is
    // `{"type":"error","message":"stream error"}` — no code, no field name, and
    // nothing stored in the thread, so the chat has neither an answer nor a
    // failure to render and nothing to look a translation up by.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Bad Profile Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest bad profile thread",
      profileId,
      agentId,
    });

    // Control: this thread answers before the bad send, so what follows is the
    // unparseable profileId and not a portal that cannot talk to the model.
    await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );

    const bad = await aiChat.sendMessage("owner", {
      threadId,
      profileId: "not-a-guid",
      agentId,
      message: "This one goes nowhere.",
      timeoutMs: STREAM_CAP_MS,
    });

    // Nothing was stored: the question is gone with the answer.
    const afterBad = await aiChat.readMessages("owner", threadId);
    expect(afterBad.status).toBe(200);
    expect(AiAgentChat.userMessages(afterBad.data)).toHaveLength(1);
    expect(AiAgentChat.assistantMessages(afterBad.data)).toHaveLength(1);
    expect(AiAgentChat.assistantStatus(afterBad.data)?.error).toBeUndefined();

    // The thread itself is unharmed — the second half of the requirement holds.
    await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReplies("owner", threadId, 2, 120000),
      2,
    );

    // What is missing is the report. A request the backend cannot even parse is
    // a malformed request, which is what the rest of this surface answers 400
    // with a message to; `{"type":"error","message":"stream error"}` is neither
    // showable nor translatable.

    expect(
      { status: bad.status, streamError: bad.streamError },
      "a request the backend cannot run says what was wrong with it",
    ).toEqual({ status: 400, streamError: undefined });
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a message past the request size limit is refused without touching the thread", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The "limit exceeded" case an API test can reach. It is refused by the
    // reverse proxy, so it never becomes a provider error: HTTP 413 with an HTML
    // body, before the model is called. What matters for the requirement is the
    // other half — the thread is untouched and the next message works.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Oversized Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest oversized thread",
      profileId,
      agentId,
    });

    const refused = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: OVERSIZED_MESSAGE,
      timeoutMs: 120000,
    });
    expect(refused.status).toBe(413);
    expect(AiAgentChat.streamFrames(refused.text)).toEqual([]);

    const afterRefusal = await aiChat.readMessages("owner", threadId);
    expect(afterRefusal.status).toBe(200);
    expect(afterRefusal.data).toEqual([]);

    await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Reply with the single word OK.",
    });
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReply("owner", threadId),
    );
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a reply the backend abandons leaves the thread able to carry on", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The timeout case as the product has it: a request for an image stops at an
    // unresolved `generate_image` call and the stream never terminates (BUG
    // 82861 — the missing failure report is that bug, not this test). What is
    // asserted here is that the abandoned turn does not take the conversation
    // with it: the half-written reply stays, and the next question is answered
    // normally in the same thread.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Abandoned Reply Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest abandoned reply thread",
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
      // The stream did not terminate inside the cap — the state under test.
    }

    const abandoned = await aiChat.readMessages("owner", threadId);
    expect(abandoned.status).toBe(200);
    const stalled = AiAgentChat.assistantMessages(abandoned.data)[0];
    expect(stalled, "the abandoned reply is stored").toBeDefined();
    expect(
      AiAgentChat.toolCalls(stalled).map((call) => call.toolName),
      finished
        ? "the stream ended — the hang this test is built on is gone"
        : "the reply stalled on the drawing tool",
    ).toContain("generate_image");

    // The stalled turn does not block the thread.
    const next = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Forget the picture. Reply with the single word OK.",
      timeoutMs: 120000,
    });
    expect(next.streamError).toBeUndefined();
    expect(next.status).toBe(200);

    const settled = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      2,
      120000,
    );
    const replies = AiAgentChat.assistantMessages(settled);
    expect(replies).toHaveLength(2);
    expect(replies[1].status?.error).toBeUndefined();
    expect(AiAgentChat.messageText(replies[1]).length).toBeGreaterThan(0);
    expect(AiAgentChat.userMessages(settled)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// The language a failure reaches the user in.
//
// The profile language is switched with `PUT /people/{userId}/culture` and the
// same failure is provoked twice — once in the portal default (en-US), once in
// the new language — in two threads of the same room, so the two payloads differ
// in nothing but the caller's culture. `portalErrorMessage` is read on both sides
// of the switch as the control: it is a message the portal does translate, so a
// pair of identical AI messages cannot be explained by a culture switch that did
// not take.

const PROFILE_LANGUAGES = ["ru", "de", "fr"] as const;

test.describe("AI Chat - the language a failed reply is reported in", () => {
  test("PUT /people/{userId}/culture, POST /api/2.0/ai/ai/send-with-stream - the failure code does not depend on the profile language", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The half a client can rely on: whatever language the user picked, the
    // failure is classified identically, so a chat can map the code to a string
    // of its own. This is the assertion that has to keep passing for any
    // localisation to be possible at all.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
    const imageProfile = AiProfiles.byCapabilities(
      await profiles.catalogue("owner"),
      AI_CAPS.imageOnly,
    );

    const { data: self } = await ownerApi.profiles.getSelfProfile();
    const ownerId = self.response!.id!;

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Failure Language Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;

    const failIn = async (title: string) => {
      const threadId = await aiChat.createThreadId("owner", {
        title,
        profileId: imageProfile.id,
        agentId: roomId,
      });
      await aiChat.sendMessage("owner", {
        threadId,
        profileId: imageProfile.id,
        agentId: roomId,
        message: "Reply with the single word OK.",
      });
      const status = AiAgentChat.assistantStatus(
        await aiChat.waitForAssistantReply("owner", threadId),
      );
      expect(status?.reason, `the send in ${title} really failed`).toBe(
        "error",
      );
      return status;
    };

    const inEnglish = await failIn("Autotest failure en");
    const controlInEnglish = await portalErrorMessage(apiSdk);

    await setProfileCulture(ownerApi, ownerId, "ru");

    // Control: the portal's own errors did switch language for this user.
    expect(
      await portalErrorMessage(apiSdk),
      "a portal error message the profile culture is known to translate",
    ).not.toBe(controlInEnglish);

    const inRussian = await failIn("Autotest failure ru");

    expect(inRussian?.error?.code).toBe(inEnglish?.error?.code);
    expect(inRussian?.reason).toBe(inEnglish?.reason);
    expect(inRussian?.type).toBe(inEnglish?.type);
  });

  for (const language of PROFILE_LANGUAGES) {
    test(`BUG 83046: PUT /people/{userId}/culture, POST /api/2.0/ai/ai/send-with-stream - the message of a failed reply stays English for a profile switched to ${language}`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      test.setTimeout(300000);
      const ownerApi = apiSdk.forRole("owner");
      await enableAiGateway(paymentsApi, ownerApi.payment);

      const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
      const profiles = new AiProfiles(apiSdk.request, apiSdk.tokenStore);
      const imageProfile = AiProfiles.byCapabilities(
        await profiles.catalogue("owner"),
        AI_CAPS.imageOnly,
      );

      const { data: self } = await ownerApi.profiles.getSelfProfile();
      const ownerId = self.response!.id!;

      const { data: room } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Failure Language Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = room.response!.id!;

      const failIn = async (title: string) => {
        const threadId = await aiChat.createThreadId("owner", {
          title,
          profileId: imageProfile.id,
          agentId: roomId,
        });
        await aiChat.sendMessage("owner", {
          threadId,
          profileId: imageProfile.id,
          agentId: roomId,
          message: "Reply with the single word OK.",
        });
        const status = AiAgentChat.assistantStatus(
          await aiChat.waitForAssistantReply("owner", threadId),
        );
        expect(status?.reason, `the send in ${title} really failed`).toBe(
          "error",
        );
        return status;
      };

      const inEnglish = await failIn("Autotest failure en");
      const controlInEnglish = await portalErrorMessage(apiSdk);

      await setProfileCulture(ownerApi, ownerId, language);

      expect(
        await portalErrorMessage(apiSdk),
        `a portal error message translated into ${language}`,
      ).not.toBe(controlInEnglish);

      const localized = await failIn(`Autotest failure ${language}`);

      // What it does today: the upstream provider's English string, unchanged.
      expect(localized?.error?.message).toBe(inEnglish?.error?.message);

      // What the user is supposed to see: the same message their portal
      // translates everything else into.
      test.fail();
      expect(
        localized?.error?.message,
        `the failure a ${language} user is shown is not English`,
      ).not.toBe(inEnglish?.error?.message);
    });
  }

  test("PUT /people/{userId}/culture, POST /api/2.0/ai/ai/send-with-stream - the portal's own gateway refusal is translated", async ({
    apiSdk,
  }) => {
    // Worth its own test because the string is DocSpace's, not a provider's:
    // "403 AI Gateway is not enabled" is produced by the portal for a tenant
    // that never paid for AI Tools. BUG 83048 (fixed) was this reaching a `ru`
    // user in English regardless.
    test.setTimeout(300000);
    const ownerApi = apiSdk.forRole("owner");
    await configureAiToolsAsUnpaid(ownerApi);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Gateway Language Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });

    const { data: self } = await ownerApi.profiles.getSelfProfile();
    const ownerId = self.response!.id!;

    const failIn = async (title: string) => {
      const threadId = await aiChat.createThreadId("owner", {
        title,
        profileId,
        agentId,
      });
      await aiChat.sendMessage("owner", {
        threadId,
        profileId,
        agentId,
        message: "Say hi",
      });
      const status = AiAgentChat.assistantStatus(
        await aiChat.waitForAssistantReply("owner", threadId, 60000),
      );
      expect(status?.error?.code, `the send in ${title} was refused`).toBe(
        "auth",
      );
      return status;
    };

    const inEnglish = await failIn("Autotest gateway en");
    const controlInEnglish = await portalErrorMessage(apiSdk);

    await setProfileCulture(ownerApi, ownerId, "ru");

    expect(
      await portalErrorMessage(apiSdk),
      "a portal error message translated into ru",
    ).not.toBe(controlInEnglish);

    const localized = await failIn("Autotest gateway ru");
    expect(
      localized?.error?.message,
      "the gateway refusal a ru user is shown is not English",
    ).not.toBe(inEnglish?.error?.message);
  });
});

/** A well-formed thread id that names nothing on this portal. */
const UNKNOWN_THREAD_ID = "019f0000-0000-7000-8000-000000000000";

type ThreadIdOperation = {
  route: string;
  act: (threadId: string) => Promise<{
    status: number;
    error?: string;
    data?: { success?: boolean };
  }>;
};

test.describe("AI Threads - renaming, deleting and clearing: validation", () => {
  test("BUG 83094: PUT /api/2.0/ai/threads/rename - a blank title is accepted and wipes the thread's name", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `create` refuses every spelling of "no title" with a 400 — see "a blank
    // title is refused" in the block above. `rename` backs the same field in the
    // same menu and validates nothing: all four spellings answer 200
    // `{"success":true}`, and `""`/`null` really do land, leaving the thread
    // listed under an empty name — a state `create` will not produce. A missing
    // `title` field is a silent no-op instead, which is the same defect seen from
    // the other side: the route never tells the caller it did nothing.
    //
    // Title length is not pinned here: a 500-character rename is accepted too,
    // and there is no documented cap to assert against.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const raw = new RawThreadCalls(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Rename Validation Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest original",
      profileId,
      agentId,
    });

    // Positive control first, because it holds whichever way the route behaves:
    // a real title through this route does land, so the 200s below are the
    // missing validation and not a route that never works.
    expect(
      (await aiChat.renameThread("owner", threadId, "Autotest renamed")).status,
    ).toBe(200);
    expect((await aiChat.getThread("owner", threadId)).data?.title).toBe(
      "Autotest renamed",
    );

    const blankTitles: Array<[string, Record<string, unknown>]> = [
      ["no title field", {}],
      ["an empty title", { title: "" }],
      ["a null title", { title: null }],
      ["a whitespace title", { title: "   " }],
    ];

    const outcomes: Array<[string, number]> = [];
    for (const [label, titleField] of blankTitles) {
      const { status } = await raw.put("owner", "/api/2.0/ai/threads/rename", {
        threadId,
        ...titleField,
      });
      outcomes.push([label, status]);
      // Put the name back, so each spelling is judged from the same start.
      await aiChat.renameThread("owner", threadId, "Autotest renamed");
    }

    test.fail();
    for (const [label, status] of outcomes) {
      expect(status, `rename with ${label} is refused`).toBe(400);
    }
  });

  test("PUT /api/2.0/ai/threads/rename, DELETE /api/2.0/ai/threads/delete, DELETE /api/2.0/ai/threads/clear-messages - a malformed threadId is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // `get-by-id` draws the line at 400 for an id that is not a thread id and 404
    // for a well-formed id that names nothing (BUG 82718, chat.permission.spec.ts).
    // Nothing in that covers the three mutating routes, and each of them answers
    // `{success:true}` on the happy path — a route that says `success` for a
    // thread that does not exist tells a client its rename or delete landed.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Thread Id Validation Agent",
      profileId,
    });

    const operations: ThreadIdOperation[] = [
      {
        route: "PUT /api/2.0/ai/threads/rename",
        act: (id) => aiChat.renameThread("owner", id, "Autotest renamed"),
      },
      {
        route: "DELETE /api/2.0/ai/threads/delete",
        act: (id) => aiChat.deleteThread("owner", id),
      },
      {
        route: "DELETE /api/2.0/ai/threads/clear-messages",
        act: (id) => aiChat.clearThreadMessages("owner", id),
      },
    ];

    for (const { route, act } of operations) {
      const malformed = await act("abc");
      expect(
        malformed.data?.success,
        `${route} on a malformed id does not claim success`,
      ).not.toBe(true);
      expect(malformed.status, `${route} on a malformed id`).toBe(400);
      expect(malformed.error, `${route} on a malformed id`).toBe("Bad Request");
    }

    // Positive control: all three routes work on a thread that does exist, in the
    // order that leaves nothing behind.
    const control = await aiChat.createThreadId("owner", {
      title: "Autotest control",
      profileId,
      agentId,
    });
    expect(
      (await aiChat.renameThread("owner", control, "Autotest control renamed"))
        .status,
    ).toBe(200);
    expect((await aiChat.clearThreadMessages("owner", control)).status).toBe(
      200,
    );
    expect((await aiChat.deleteThread("owner", control)).status).toBe(200);
  });

  test("PUT /api/2.0/ai/threads/rename, DELETE /api/2.0/ai/threads/clear-messages - an unknown threadId is a 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Two of the three routes get this right. `delete` is the exception and has
    // its own test below.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Unknown Thread Agent",
      profileId,
    });

    const operations: ThreadIdOperation[] = [
      {
        route: "PUT /api/2.0/ai/threads/rename",
        act: (id) => aiChat.renameThread("owner", id, "Autotest renamed"),
      },
      {
        route: "DELETE /api/2.0/ai/threads/clear-messages",
        act: (id) => aiChat.clearThreadMessages("owner", id),
      },
    ];

    for (const { route, act } of operations) {
      const unknown = await act(UNKNOWN_THREAD_ID);
      expect(
        unknown.data?.success,
        `${route} on an unknown id does not claim success`,
      ).not.toBe(true);
      expect(unknown.status, `${route} on an unknown id`).toBe(404);
      expect(unknown.error, `${route} on an unknown id`).toBe("Not Found");
    }

    // Positive control: both routes answer 200 on a thread that does exist.
    const control = await aiChat.createThreadId("owner", {
      title: "Autotest control",
      profileId,
      agentId,
    });
    expect(
      (await aiChat.renameThread("owner", control, "Autotest control renamed"))
        .status,
    ).toBe(200);
    expect((await aiChat.clearThreadMessages("owner", control)).status).toBe(
      200,
    );
  });

  test("BUG 83095: DELETE /api/2.0/ai/threads/delete - deleting a thread that does not exist reports success instead of 404", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Both spellings of "no such thread" — an id that was never issued and an id
    // whose thread this very test deleted — answer 200 `{"success":true}`. So a
    // client cannot tell a delete that removed a chat from one that removed
    // nothing, and a repeat of the menu action always looks like it worked.
    //
    // `rename` and `clear-messages` answer 404 on the same ids, which is what
    // makes this the outlier rather than a deliberate idempotent-delete contract.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Delete Unknown Agent",
      profileId,
    });
    const keeper = await aiChat.createThreadId("owner", {
      title: "Autotest keeper",
      profileId,
      agentId,
    });
    const doomed = await aiChat.createThreadId("owner", {
      title: "Autotest doomed",
      profileId,
      agentId,
    });
    expect((await aiChat.deleteThread("owner", doomed)).status).toBe(200);

    const unknownId = await aiChat.deleteThread("owner", UNKNOWN_THREAD_ID);
    const deletedTwice = await aiChat.deleteThread("owner", doomed);

    // Everything below holds whichever status the route settles on, so a fix
    // cannot leave this test passing for the wrong reason.
    expect(
      (await aiChat.renameThread("owner", UNKNOWN_THREAD_ID, "X")).status,
      "rename says 404 on the same unknown id",
    ).toBe(404);
    expect(
      (await aiChat.clearThreadMessages("owner", doomed)).status,
      "clear-messages says 404 on the same deleted id",
    ).toBe(404);
    // And nothing was created or destroyed by any of it.
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toEqual([keeper]);

    test.fail();
    expect(unknownId.status, "deleting an id that never existed").toBe(404);
    expect(deletedTwice.status, "deleting an already deleted thread").toBe(404);
  });

  test("DELETE /api/2.0/ai/threads/delete - a deleted thread is unreachable through every route", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Deleting from the menu has to be final: the id of a deleted thread must
    // behave like an id that never existed. A rename landing on a deleted thread,
    // or its messages still being readable, would mean the row is still there for
    // anyone holding the id.
    //
    // A second `delete` is the one route that does not refuse it — that is the
    // BUG test above, and it is left out here so this one stays a clean pass.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Deleted Thread Agent",
      profileId,
    });
    const doomed = await aiChat.createThreadId("owner", {
      title: "Autotest doomed",
      profileId,
      agentId,
    });
    const keeper = await aiChat.createThreadId("owner", {
      title: "Autotest keeper",
      profileId,
      agentId,
    });
    const appended = await aiChat.appendUserMessage("owner", {
      threadId: doomed,
      profileId,
      text: "Something to lose with the thread",
    });
    expect(appended.status, "seeding the thread to delete").toBe(200);

    expect((await aiChat.deleteThread("owner", doomed)).status).toBe(200);

    const read = await aiChat.getThread("owner", doomed);
    expect(read.status).toBe(404);
    expect(read.error).toBe("thread not found");

    const messages = await aiChat.readMessages("owner", doomed);
    expect(messages.status).toBe(404);
    expect(messages.data, "and its messages went with it").toEqual([]);

    for (const { route, act } of [
      {
        route: "PUT /api/2.0/ai/threads/rename",
        act: (id: string) => aiChat.renameThread("owner", id, "Back from gone"),
      },
      {
        route: "DELETE /api/2.0/ai/threads/clear-messages",
        act: (id: string) => aiChat.clearThreadMessages("owner", id),
      },
    ] as ThreadIdOperation[]) {
      const { status, data } = await act(doomed);
      expect(
        data?.success,
        `${route} on a deleted thread does not claim success`,
      ).not.toBe(true);
      expect(status, `${route} on a deleted thread`).toBe(404);
    }

    // Nothing of this reached the thread next to it, and the deleted one did not
    // reappear in the list along the way.
    const survivor = await aiChat.getThread("owner", keeper);
    expect(survivor.status).toBe(200);
    expect(survivor.data?.title).toBe("Autotest keeper");
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toEqual([keeper]);
  });

  test("DELETE /api/2.0/ai/threads/clear-messages - clearing an empty thread, and clearing twice, keeps the thread whole", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The menu entry fires without knowing whether the thread holds anything, so
    // both an empty thread and a repeat have to be ordinary 200s — and neither
    // may take the thread, its title or its model with it. The model matters:
    // there is no route that sets a thread's profileId after creation (see "no
    // route changes a thread's model"), so a clear that dropped it would leave
    // the thread on whatever the portal-wide binding happens to be.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Repeat Clear Agent",
      profileId,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest cleared twice",
      profileId,
      agentId,
    });

    const expectThreadIntact = async (label: string) => {
      const messages = await aiChat.readMessages("owner", threadId);
      expect(messages.status, label).toBe(200);
      expect(messages.data, `${label}: no messages`).toEqual([]);

      const thread = await aiChat.getThread("owner", threadId);
      expect(thread.status, label).toBe(200);
      expect(thread.data?.threadId, `${label}: the same thread`).toBe(threadId);
      expect(thread.data?.title, `${label}: its title`).toBe(
        "Autotest cleared twice",
      );
      expect(thread.data?.profileId, `${label}: its model`).toBe(profileId);
    };

    const empty = await aiChat.clearThreadMessages("owner", threadId);
    await expectThreadIntact("after clearing a thread that was already empty");
    expect(empty.data?.success).toBe(true);
    expect(empty.status).toBe(200);

    const appended = await aiChat.appendUserMessage("owner", {
      threadId,
      profileId,
      text: "Something to clear",
    });
    expect(appended.status).toBe(200);
    expect((await aiChat.readMessages("owner", threadId)).data).toHaveLength(1);

    const first = await aiChat.clearThreadMessages("owner", threadId);
    await expectThreadIntact("after clearing a thread that held a message");
    expect(first.data?.success).toBe(true);
    expect(first.status).toBe(200);

    const second = await aiChat.clearThreadMessages("owner", threadId);
    await expectThreadIntact("after clearing the same thread again");
    expect(second.data?.success).toBe(true);
    expect(second.status).toBe(200);

    // And it is still the entity's thread, not an orphan the list dropped.
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((thread) => thread.threadId)).toEqual([threadId]);
  });
});

test.describe("AI Threads - a cleared thread carries on", () => {
  test("DELETE /api/2.0/ai/threads/clear-messages, POST /api/2.0/ai/ai/send-with-stream - a cleared thread answers again and no longer knows the cleared history", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The point of the requirement: clearing the history has to reach the model,
    // not just the transcript the reader gets. `read-messages` coming back empty
    // would be equally true of a backend that hid the transcript and kept
    // feeding it to the model — the conversation would then keep answering from
    // history the user believes is gone.
    //
    // Three inference turns, so the default 240s test timeout is not enough.
    test.setTimeout(600000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Cleared Chat Agent",
      profileId,
      prompt: SHORT_ANSWER_PROMPT,
    });
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest cleared thread",
      profileId,
      agentId,
    });

    const teach = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Remember the code word ORANGE. Reply with just: OK.",
    });
    expect(teach.status).toBe(200);
    expect(teach.streamError).toBeUndefined();
    expectHealthyAssistantReply(
      await aiChat.waitForAssistantReplies("owner", threadId, 1, 120000),
    );

    // The positive control, in this thread and on this model: before the clear
    // the word is recalled. Without it, the miss after the clear could just be a
    // model that would not have remembered either way.
    const recallQuestion =
      "What code word did I ask you to remember earlier in this conversation? If no code word was ever mentioned here, reply with just: NONE.";
    const beforeClear = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: recallQuestion,
    });
    expect(beforeClear.status).toBe(200);
    expect(beforeClear.streamError).toBeUndefined();
    const withHistory = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      2,
      120000,
    );
    expectHealthyAssistantReply(withHistory, 2);
    expect(
      AiAgentChat.messageText(
        AiAgentChat.assistantMessages(withHistory)[1],
      ).toUpperCase(),
      "the model recalls the word while the history is still there",
    ).toContain("ORANGE");

    const cleared = await aiChat.clearThreadMessages("owner", threadId);
    expect(cleared.data?.success).toBe(true);
    expect(cleared.status).toBe(200);
    expect((await aiChat.readMessages("owner", threadId)).data).toEqual([]);

    // The same question again. The thread still exists, so this is the cleared
    // thread carrying on rather than a new one.
    const afterClear = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: recallQuestion,
    });
    expect(afterClear.status).toBe(200);
    expect(afterClear.streamError).toBeUndefined();
    const withoutHistory = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      1,
      120000,
    );
    // Healthy, so "it did not know" cannot be a failed reply in disguise, and
    // exactly one turn — the cleared ones did not come back with it.
    expectHealthyAssistantReply(withoutHistory);
    expect(AiAgentChat.userMessages(withoutHistory)).toHaveLength(1);
    expect(
      withoutHistory
        .map((message) => AiAgentChat.messageText(message))
        .join("\n")
        .toUpperCase(),
      "the cleared word is neither answered nor stored again",
    ).not.toContain("ORANGE");

    // Same thread, same name, same model, still listed under the agent.
    const thread = await aiChat.getThread("owner", threadId);
    expect(thread.status).toBe(200);
    expect(thread.data?.title).toBe("Autotest cleared thread");
    expect(thread.data?.profileId).toBe(profileId);
    const listed = await aiChat.listThreads("owner", agentId);
    expect(listed.status).toBe(200);
    expect(listed.data.map((entry) => entry.threadId)).toEqual([threadId]);
  });
});

// The starter buttons an empty AI Chat offers ("Summarize the knowledge base",
// "Find contradictions", …).
//
// What the mechanism turned out to be, measured on a live portal:
//
//   * Nothing serves the list. `/ai/prompts/suggested`, `/ai/prompts/default`,
//     `/ai/prompts/built-in`, `/ai/suggested-prompts` and
//     `/ai/ai/suggested-prompts` are all 404, `/ai/config` and
//     `/ai/config/user` carry no such field, and `/ai/prompts/list` is the
//     user's own prompt library — empty on a fresh portal, see
//     ai/prompts/prompts.spec.ts. The labels are client-side constants.
//   * Pressing one is an ORDINARY text message: the label is sent verbatim as
//     `userMessage.content[0].text` on `POST /ai/ai/send-with-stream`. No
//     dedicated route, no action type, no extra `actionArgs` — which is why
//     every test below asserts the stored user message equals the label
//     character for character. There is nothing else to reproduce.
//   * Six of the eight are answered out of the Knowledge Base through ONE
//     server-executed `docspace_knowledge_search` tool call. It is auto-run:
//     the stream carries no `tool-call-pending`, so no approve-tool-call round
//     trip stands between the button and the answer.
//   * That tool is NOT in `GET /ai/tools/list-system-tools`, which advertises
//     23 unrelated docspace file/folder/room/people tools instead. The
//     catalogue is not the toolset the model gets — same disagreement as
//     BUG 83013.
//   * The tool is offered only when the Knowledge Base holds indexed content.
//     Against an empty one the model answers that it has no file tools at all,
//     which is what the empty-Knowledge-Base control test at the bottom pins —
//     and what makes the marker assertions above it mean something.
//
// Grounding is asserted two ways, because "the model said words" is not proof
// it read anything: the search result really carried the fixture text, and the
// answer really quotes a marker that exists nowhere but the fixture. The exact
// wording is never asserted — that is the model's, and it is not deterministic.

/** Invented tokens: neither can be produced without reading the fixture. */
const VENDOR_CODE = "ZORBAX-77";
const SAVED_MARKER = "QUUX-4242";

const CONTRACT_TITLE = "Autotest Vendor Contract";
const ADDENDUM_TITLE = "Autotest Payment Addendum";
const SAVED_TITLE = "Autotest Saved Summary";

const CONTRACT_TEXT =
  `Vendor contract. The approved vendor is ${VENDOR_CODE}. ` +
  "Invoices must be paid within 45 days. " +
  "Task: Kate must submit the vendor report by 2026-09-15. " +
  "The Q3 audit deadline is 2026-09-30.";

// Deliberately disagrees with the contract on the payment window, and says so
// in a way that cannot be read as superseding it — that is the contradiction
// "Find contradictions" has to have something to find.
const ADDENDUM_TEXT =
  `Payment addendum for vendor ${VENDOR_CODE}. ` +
  "Invoices must be paid within 90 days. This supersedes nothing. " +
  "Task: Boris must archive the invoices by 2026-10-05.";

const SAVED_TEXT = `Saved result: the ${SAVED_MARKER} quarterly report was generated by the agent.`;

const KNOWLEDGE_SEARCH_TOOL = "docspace_knowledge_search";

/**
 * Fixture markers a grounded answer may quote, per prompt. Any ONE match is
 * enough: which of them the model picks up is its own choice, but none of them
 * can appear in an answer that never read the Knowledge Base. Word boundaries
 * matter on the bare numbers — an unanchored "45" also matches "2045".
 */
const SUGGESTED_PROMPTS: Array<{
  /** The button label, sent verbatim. */
  prompt: string;
  grounding: RegExp[];
}> = [
  {
    prompt: "Summarize the knowledge base",
    grounding: [
      new RegExp(VENDOR_CODE),
      new RegExp(CONTRACT_TITLE),
      new RegExp(ADDENDUM_TITLE),
    ],
  },
  {
    prompt: "Show source documents",
    grounding: [
      new RegExp(CONTRACT_TITLE),
      new RegExp(ADDENDUM_TITLE),
      new RegExp(VENDOR_CODE),
    ],
  },
  {
    prompt: "Find a document",
    grounding: [
      new RegExp(CONTRACT_TITLE),
      new RegExp(ADDENDUM_TITLE),
      new RegExp(VENDOR_CODE),
    ],
  },
  {
    prompt: "Find tasks and deadlines",
    grounding: [
      /\bKate\b/,
      /\bBoris\b/,
      /2026-09-15/,
      /2026-10-05/,
      /September 15/,
      /October 5/,
    ],
  },
  {
    prompt: "Compare documents",
    grounding: [
      /\b45\b/,
      /\b90\b/,
      new RegExp(CONTRACT_TITLE),
      new RegExp(ADDENDUM_TITLE),
    ],
  },
  {
    prompt: "Find contradictions",
    grounding: [/\b45\b/, /\b90\b/, new RegExp(VENDOR_CODE)],
  },
];

type PromptsAgent = {
  aiChat: AiAgentChat;
  profileId: string;
  agentId: number;
  knowledgeId: number;
  resultStorageId: number;
};

/** An agent plus the ids of the two folders inside it that accept files. */
async function createPromptsAgent(apiSdk: ApiSDK): Promise<PromptsAgent> {
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: "Autotest Suggested Prompts Agent",
    profileId,
  });

  const ownerApi = apiSdk.forRole("owner");
  return {
    aiChat,
    profileId,
    agentId,
    knowledgeId: await agentStorageFolderId(
      ownerApi,
      agentId,
      FolderType.Knowledge,
    ),
    resultStorageId: await agentStorageFolderId(
      ownerApi,
      agentId,
      FolderType.ResultStorage,
    ),
  };
}

/**
 * Writes one deterministic .docx into an agent folder, using the portal's own
 * exporter so the bytes are a real document rather than hand-assembled ones.
 *
 * Setup-only, so it throws: a fixture that never landed would turn every
 * grounding assertion below into "the model did not mention the marker", which
 * reads like a product failure instead of a missing file.
 */
async function writeAgentDocument(
  apiSdk: ApiSDK,
  folderId: number,
  title: string,
  content: string,
): Promise<number> {
  const settings = new AiSettings(apiSdk.request, apiSdk.tokenStore);
  const { status } = await settings.textToDocx("owner", {
    title,
    content,
    folderId,
  });
  if (status !== 202) {
    throw new Error(`text-to-docx for "${title}" failed: ${status}`);
  }

  const file = await waitForExportedFile(
    apiSdk.forRole("owner"),
    folderId,
    `${title}.docx`,
  );
  if (!file) {
    throw new Error(`"${title}.docx" never appeared in folder ${folderId}`);
  }
  return file.id;
}

/** The two contradicting Knowledge Base documents every data prompt reads. */
async function fillKnowledgeBase(apiSdk: ApiSDK, agent: PromptsAgent) {
  await writeAgentDocument(
    apiSdk,
    agent.knowledgeId,
    CONTRACT_TITLE,
    CONTRACT_TEXT,
  );
  await writeAgentDocument(
    apiSdk,
    agent.knowledgeId,
    ADDENDUM_TITLE,
    ADDENDUM_TEXT,
  );
}

/**
 * Asserts the stream ran to a clean finish. Every send in this suite has the
 * same plumbing, and the interesting part is what the answer says.
 *
 * `message-end` being last is the whole point: `message-incomplete` is how a
 * cut-off generation ends, an `error` frame is how a failed request reports
 * itself (HTTP is still 200), and `tool-call-pending` would mean the answer is
 * parked waiting for a client decision the suggested-prompt flow never makes.
 */
function expectCompletedStream(body: string) {
  const types = AiAgentChat.frameTypes(body);

  expect(types, "the stream reported an error frame").not.toContain("error");
  expect(types, "the generation was cut off").not.toContain(
    "message-incomplete",
  );
  expect(types, "the answer is parked on a tool approval").not.toContain(
    "tool-call-pending",
  );

  expect(types).toContain("user-message-stored");
  expect(types).toContain("message-start");
  expect(
    types.filter((type) => type === "message-delta").length,
    "the reply arrived in at least one delta",
  ).toBeGreaterThan(0);
  expect(types[types.length - 1], "the last frame is the terminal one").toBe(
    "message-end",
  );
}

/** The `docspace_knowledge_search` results of a reply, as raw JSON strings. */
function knowledgeSearchResults(reply: AiThreadMessage): string[] {
  return AiAgentChat.toolCalls(reply)
    .filter((call) => call.toolName === KNOWLEDGE_SEARCH_TOOL)
    .map((call) => JSON.stringify(call.result ?? ""));
}

function expectMatchesAny(text: string, patterns: RegExp[], label: string) {
  expect(
    patterns.some((pattern) => pattern.test(text)),
    `${label} — none of ${patterns.map(String).join(", ")} in:\n${text}`,
  ).toBe(true);
}

test.describe("POST /api/2.0/ai/ai/send-with-stream - AI Chat suggested prompts", () => {
  for (const { prompt, grounding } of SUGGESTED_PROMPTS) {
    test(`POST /api/2.0/ai/ai/send-with-stream - suggested prompt "${prompt}" is answered from the Knowledge Base`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

      const agent = await createPromptsAgent(apiSdk);
      await fillKnowledgeBase(apiSdk, agent);

      const threadId = await agent.aiChat.createThreadId("owner", {
        title: "Autotest suggested prompt thread",
        profileId: agent.profileId,
        agentId: agent.agentId,
      });

      const sent = await agent.aiChat.sendMessage("owner", {
        threadId,
        profileId: agent.profileId,
        agentId: agent.agentId,
        message: prompt,
      });

      expect(sent.status).toBe(200);
      expect(sent.streamError).toBeUndefined();
      expectCompletedStream(sent.text);

      const messages = await agent.aiChat.waitForAssistantReply(
        "owner",
        threadId,
      );

      // The label is what reached the backend — no prefix, no wrapper, no
      // hidden instruction bolted onto a starter button.
      expect(
        AiAgentChat.userMessages(messages).map((message) =>
          AiAgentChat.messageText(message),
        ),
      ).toEqual([prompt]);

      // Not `some(role === "assistant")`: a refused inference is stored as an
      // assistant message too, so that check passes on a dead portal.
      expectHealthyAssistantReply(messages);

      const reply = AiAgentChat.assistantMessages(messages)[0];
      const answer = AiAgentChat.messageText(reply);

      // The stream and the persisted message are the same answer — a client
      // that rendered the stream is not showing something the thread will
      // disagree with when it is reopened.
      expect(AiAgentChat.streamedText(sent.text)).toBe(answer);

      // Grounding, half one: the Knowledge Base really was searched, and the
      // search really came back with the fixture's text. This half is
      // deterministic — it is the tool's output, not the model's prose.
      const results = knowledgeSearchResults(reply);
      expect(
        results.length,
        `the reply made no ${KNOWLEDGE_SEARCH_TOOL} call`,
      ).toBeGreaterThan(0);
      expect(results.join("\n")).toContain(VENDOR_CODE);

      // Grounding, half two: the answer quotes something only the fixture
      // could have supplied, so it is not a generic reply written around the
      // question.
      expectMatchesAny(answer, grounding, "the answer is not grounded");
    });
  }

  test('POST /api/2.0/ai/ai/send-with-stream - suggested prompt "What can I ask you" is answered without any context', async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

    // The only prompt of the eight that asks about the assistant rather than
    // about the data, so it is the one case with nothing to ground against and
    // no Knowledge Base to prepare. It must still produce a real answer.
    const agent = await createPromptsAgent(apiSdk);

    const threadId = await agent.aiChat.createThreadId("owner", {
      title: "Autotest suggested prompt thread",
      profileId: agent.profileId,
      agentId: agent.agentId,
    });

    const sent = await agent.aiChat.sendMessage("owner", {
      threadId,
      profileId: agent.profileId,
      agentId: agent.agentId,
      message: "What can I ask you",
    });

    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectCompletedStream(sent.text);

    const messages = await agent.aiChat.waitForAssistantReply(
      "owner",
      threadId,
    );
    expect(
      AiAgentChat.userMessages(messages).map((message) =>
        AiAgentChat.messageText(message),
      ),
    ).toEqual(["What can I ask you"]);
    expectHealthyAssistantReply(messages);

    const answer = AiAgentChat.messageText(
      AiAgentChat.assistantMessages(messages)[0],
    );
    expect(AiAgentChat.streamedText(sent.text)).toBe(answer);
    // A one-word acknowledgement would satisfy "non-empty" while telling the
    // user nothing about what the assistant can do.
    expect(answer.trim().length).toBeGreaterThan(40);
  });

  // The control for every grounding assertion above.
  //
  // Same prompt, same agent shape, only the Knowledge Base is empty — and the
  // marker is gone from the answer, which is what proves the marker in the
  // other tests was read out of the fixture rather than being something this
  // model says anyway. It also pins the behaviour behind the "Show saved
  // results" bug below: with nothing indexed, `docspace_knowledge_search` is
  // not offered to the model at all, and it answers that it has no file tools —
  // while `list-system-tools` still advertises 23 of them.
  test('POST /api/2.0/ai/ai/send-with-stream - suggested prompt "Summarize the knowledge base" against an empty Knowledge Base invents nothing', async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

    const agent = await createPromptsAgent(apiSdk);
    const ownerApi = apiSdk.forRole("owner");

    // Assert the premise rather than assume it: a Knowledge Base that quietly
    // had something in it would make the missing marker meaningless.
    const { data: knowledge, status: knowledgeStatus } =
      await ownerApi.folders.getFolderByFolderId({
        folderId: agent.knowledgeId,
      });
    expect(knowledgeStatus).toBe(200);
    expect(knowledge.response?.files ?? []).toEqual([]);

    const threadId = await agent.aiChat.createThreadId("owner", {
      title: "Autotest suggested prompt thread",
      profileId: agent.profileId,
      agentId: agent.agentId,
    });

    const sent = await agent.aiChat.sendMessage("owner", {
      threadId,
      profileId: agent.profileId,
      agentId: agent.agentId,
      message: "Summarize the knowledge base",
    });

    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectCompletedStream(sent.text);

    const messages = await agent.aiChat.waitForAssistantReply(
      "owner",
      threadId,
    );
    expectHealthyAssistantReply(messages);

    const reply = AiAgentChat.assistantMessages(messages)[0];
    expect(AiAgentChat.messageText(reply)).not.toContain(VENDOR_CODE);
    expect(knowledgeSearchResults(reply)).toEqual([]);
  });

  test('POST /api/2.0/ai/ai/send-with-stream - suggested prompt "Show saved results" reads the Result Storage folder', async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

    const agent = await createPromptsAgent(apiSdk);
    const savedId = await writeAgentDocument(
      apiSdk,
      agent.resultStorageId,
      SAVED_TITLE,
      SAVED_TEXT,
    );

    // The Knowledge Base is filled too, so the search tool is definitely
    // offered. That keeps the failure specific — "the corpus excludes Result
    // Storage" rather than "the model was given no tools at all", which is
    // what the empty-Knowledge-Base test above already covers.
    await fillKnowledgeBase(apiSdk, agent);

    // The premise: the saved document really is stored, and really is where
    // the UI's "saved results" live.
    const ownerApi = apiSdk.forRole("owner");
    const { data: storage, status: storageStatus } =
      await ownerApi.folders.getFolderByFolderId({
        folderId: agent.resultStorageId,
      });
    expect(storageStatus).toBe(200);
    expect(
      ((storage.response?.files ?? []) as Array<{ id?: number }>).map(
        (file) => file.id,
      ),
    ).toContain(savedId);

    const threadId = await agent.aiChat.createThreadId("owner", {
      title: "Autotest suggested prompt thread",
      profileId: agent.profileId,
      agentId: agent.agentId,
    });

    const sent = await agent.aiChat.sendMessage("owner", {
      threadId,
      profileId: agent.profileId,
      agentId: agent.agentId,
      message: "Show saved results",
    });

    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();
    expectCompletedStream(sent.text);

    const messages = await agent.aiChat.waitForAssistantReply(
      "owner",
      threadId,
    );
    expectHealthyAssistantReply(messages);

    const answer = AiAgentChat.messageText(
      AiAgentChat.assistantMessages(messages)[0],
    );

    expectMatchesAny(
      answer,
      [new RegExp(SAVED_MARKER), new RegExp(SAVED_TITLE)],
      "the answer never reached Result Storage",
    );
  });
});
