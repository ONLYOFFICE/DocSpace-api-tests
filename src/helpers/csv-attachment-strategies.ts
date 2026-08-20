import { expect } from "@playwright/test";
import {
  FolderType,
  RoomType,
  VectorizationStatus,
} from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "@/src/services/api-sdk";
import { PaymentApi } from "@/src/services/payment-api";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  AiAgentChat,
  AiThreadMessage,
  expectHealthyAssistantReply,
} from "@/src/helpers/ai-agent-chat";
import { AiAttachments } from "@/src/helpers/ai-attachments";
import {
  agentStorageFolderId,
  attachDocSpaceFile,
  expectDeviceFileStored,
  UploadedFile,
} from "@/src/helpers/device-upload";
import { waitForVectorization } from "@/src/helpers/ai-vectorization";
import { CsvFixture } from "@/src/helpers/csv-fixtures";

// The three ways the composer lets a user get a file in front of an agent —
// reduced honestly to what the server actually does differently for each,
// per device-upload.ts and ai-attachments.ts:
//
//   1. Knowledge — the file is uploaded into the agent's Knowledge folder and
//      indexed; no message carries an attachment, the model reaches the data
//      itself via the auto-run `docspace_knowledge_search` tool. This is the
//      one method that is genuinely a different mechanism end to end.
//
//   2. Device attach and 3. Select existing DocSpace file are, at the API
//      layer, THE SAME MECHANISM: `save-file` with `path` = a DocSpace file
//      id, which the server resolves, access-checks and extracts text from —
//      "a file draft is a reference to a DocSpace file" per ai-attachments.ts,
//      and "what has no server-side representation is the destination
//      choice" per the note in attachments.spec.ts. A UI can tell a user
//      "picked from your device" vs "picked from DocSpace" as different
//      gestures; the API cannot observe that distinction at all, because
//      there is no route that ingests raw bytes into a chat message — every
//      attachment is upload-then-reference.
//
//      What genuinely differs between the two below is the SETUP, not the
//      attach call itself: Device uploads into "@my" (My Documents) after
//      the agent/thread already exist — the composer's own documented
//      fallback for "the chat's own room refuses uploads" — simulating a
//      file picked fresh, mid-conversation. Existing creates an unrelated
//      Custom room and the file inside it BEFORE the agent or thread exist at
//      all, simulating a file that was already sitting somewhere in DocSpace
//      well before this chat started. That is real, if narrower, coverage:
//      it still exercises `attachDocSpaceFile`'s cross-room access check
//      against a room the agent has nothing to do with, which "@my" alone
//      would not.
//
// All three hand every question-asking test the same shape, `ask(prompt)`, so
// the 27-question batteries in questions.ts run unmodified against whichever
// method set them up.

export type AskResult = { text: string; reply: AiThreadMessage };

export type CsvAttachmentContext = {
  agentId: number;
  threadId: string;
  ask: (prompt: string) => Promise<AskResult>;
};

/**
 * Shared "send, wait for the Nth reply, assert it came back healthy" plumbing.
 * `firstCallAttachments`, when given, rides only on the very first message —
 * matching how a real chat attaches a file once and keeps talking about it,
 * and keeping the cost of a 16-question battery to one attach instead of 16.
 */
function makeAsker(
  aiChat: AiAgentChat,
  agentId: number,
  profileId: string,
  threadId: string,
  firstCallAttachments?: Array<Record<string, unknown>>,
): (prompt: string) => Promise<AskResult> {
  let replyCount = 0;
  let pendingAttachments = firstCallAttachments;

  return async (prompt: string): Promise<AskResult> => {
    const attachments = pendingAttachments;
    pendingAttachments = undefined;

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: prompt,
      ...(attachments ? { attachments } : {}),
    });
    expect(sent.status, `send-with-stream for "${prompt}"`).toBe(200);
    expect(sent.streamError, `stream error for "${prompt}"`).toBeUndefined();

    replyCount += 1;
    const messages = await aiChat.waitForAssistantReplies(
      "owner",
      threadId,
      replyCount,
    );
    expectHealthyAssistantReply(messages, replyCount);

    const reply = AiAgentChat.assistantMessages(messages)[replyCount - 1];
    return { text: AiAgentChat.messageText(reply), reply };
  };
}

async function createFundedAgentAndThread(
  apiSdk: ApiSDK,
  paymentsApi: PaymentApi,
  title: string,
) {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);

  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", {
    title: `${title} Agent`,
    profileId,
  });
  const threadId = await aiChat.createThreadId("owner", {
    title,
    profileId,
    agentId,
  });

  return { ownerApi, aiChat, profileId, agentId, threadId };
}

/** Method 1 — Knowledge upload. */
export async function attachViaKnowledge(
  apiSdk: ApiSDK,
  paymentsApi: PaymentApi,
  fixture: CsvFixture,
  title: string,
): Promise<CsvAttachmentContext> {
  const { ownerApi, aiChat, profileId, agentId, threadId } =
    await createFundedAgentAndThread(apiSdk, paymentsApi, title);

  const knowledgeId = await agentStorageFolderId(
    ownerApi,
    agentId,
    FolderType.Knowledge,
  );
  const uploaded = await expectDeviceFileStored(
    apiSdk,
    "owner",
    knowledgeId,
    fixture.fileName,
    fixture.buffer,
    "text/csv",
  );
  const status = await waitForVectorization(ownerApi, uploaded.id);
  expect(status, `${fixture.fileName} vectorization`).toBe(
    VectorizationStatus.Completed,
  );

  return {
    agentId,
    threadId,
    ask: makeAsker(aiChat, agentId, profileId, threadId),
  };
}

/**
 * Method 2 — attach from device: uploaded fresh into My Documents, after the
 * agent and thread already exist, then attached by reference to the first
 * message. My Documents is not a guess — it is the composer's own documented
 * fallback for "the chat's own room cannot accept an upload" (see the file
 * header and agent_room_root_is_not_writable: an agent room's root is
 * `security.Create:false`, so a real client would fall back exactly here).
 */
export async function attachViaDevice(
  apiSdk: ApiSDK,
  paymentsApi: PaymentApi,
  fixture: CsvFixture,
  title: string,
): Promise<CsvAttachmentContext> {
  const { aiChat, profileId, agentId, threadId } =
    await createFundedAgentAndThread(apiSdk, paymentsApi, title);
  const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

  const uploaded = await expectDeviceFileStored(
    apiSdk,
    "owner",
    "@my",
    fixture.fileName,
    fixture.buffer,
    "text/csv",
  );
  const draft = await attachDocSpaceFile(
    attachments,
    "owner",
    uploaded.id,
    uploaded.title,
    String(agentId),
  );
  expect(draft.status, `attaching ${fixture.fileName} from device`).toBe(200);

  return {
    agentId,
    threadId,
    ask: makeAsker(aiChat, agentId, profileId, threadId, [
      { id: draft.data!.id },
    ]),
  };
}

/**
 * A file sitting in a Custom room that has nothing to do with the agent —
 * created and populated before the agent or thread exist, so it is genuinely
 * pre-existing rather than merely uploaded first.
 */
async function createPreExistingFile(
  apiSdk: ApiSDK,
  fixture: CsvFixture,
  title: string,
): Promise<UploadedFile> {
  const ownerApi = apiSdk.forRole("owner");
  const { status, data } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: {
      title: `${title} Pre-existing Storage`,
      roomType: RoomType.CustomRoom,
    },
  });
  const roomId = data.response?.id;
  if (status !== 200 || !roomId) {
    throw new Error(`createRoom for "${title}" failed: ${status}`);
  }

  return expectDeviceFileStored(
    apiSdk,
    "owner",
    roomId,
    fixture.fileName,
    fixture.buffer,
    "text/csv",
  );
}

/**
 * Method 3 — select a file already sitting elsewhere in DocSpace, by
 * reference. See the file header: this rides the exact same `save-file`
 * mechanism as Method 2 — the only thing that differs is that the file is
 * created in its own unrelated room before the agent/thread exist at all,
 * rather than uploaded mid-conversation into My Documents.
 */
export async function attachViaExistingDocSpaceFile(
  apiSdk: ApiSDK,
  paymentsApi: PaymentApi,
  fixture: CsvFixture,
  title: string,
): Promise<CsvAttachmentContext> {
  const preExisting = await createPreExistingFile(apiSdk, fixture, title);

  const { aiChat, profileId, agentId, threadId } =
    await createFundedAgentAndThread(apiSdk, paymentsApi, title);
  const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

  const draft = await attachDocSpaceFile(
    attachments,
    "owner",
    preExisting.id,
    preExisting.title,
    String(agentId),
  );
  expect(draft.status, `selecting ${fixture.fileName} from DocSpace`).toBe(200);

  return {
    agentId,
    threadId,
    ask: makeAsker(aiChat, agentId, profileId, threadId, [
      { id: draft.data!.id },
    ]),
  };
}

export type AttachmentMethod = {
  name: string;
  attach: typeof attachViaKnowledge;
};

export const ATTACHMENT_METHODS: AttachmentMethod[] = [
  { name: "Knowledge upload", attach: attachViaKnowledge },
  { name: "Device attach", attach: attachViaDevice },
  {
    name: "Select existing DocSpace file",
    attach: attachViaExistingDocSpaceFile,
  },
];
