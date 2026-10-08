import { expect } from "@playwright/test";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  AiAgentChat,
  SkillCatalogueEntry,
  expectHealthyAssistantReply,
  inviteToAgent,
} from "@/src/helpers/ai-agent-chat";
import { uploadFileToFolder } from "@/src/helpers/upload-file";
import { ApiSDK } from "@/src/services/api-sdk";

// Permissions of the AI Skills contract — see skills.spec.ts for the base
// mechanism (`actionArgs.contextRoom.skills` + the model's own `read_skill`
// call). The rule under test: a skill in a room's `.ai` folder is usable only
// by someone who can both (a) open that room and (b) use AI Chat there —
// neither alone is enough, and losing either closes it again. Reuses the
// exact QA skill/canary from skills.spec.ts, so a positive result here is the
// identical body→canary chain the functional suite already proved, not a
// weaker stand-in for it.
//
// One authenticated member per test: `apiSdk.request` is a single shared
// context whose session cookie outranks the bearer token, so owner-side
// setup always happens before `addAuthenticatedMember`, and every conclusion
// that depends on *who* called is pinned with `expectActingAs` first — see
// the same convention in chat.permission.spec.ts and
// attachments.permission.spec.ts.
//
// Measured live on 2026-10-06. The one genuinely new question this file
// answers (everything else reuses an already-established room/chat
// permission contract — see the per-test notes) is whether `read_skill`
// re-checks the caller's real access to the referenced file, or just trusts
// whatever `contextRoom` the client sends: an outsider's spoofed
// `contextRoom` naming a victim room/skill still gets `read_skill` called,
// but the tool's own result is a server-side 403 from the real DocSpace
// files API (`GET /files/rooms/{roomId}/ai`), not the skill's body — so the
// authorization lives in `read_skill` itself, not in the client-supplied
// catalogue.

const CANARY = "СКИЛЛ ПРОЧИТАН: СИНИЙ ЕНОТ 7429";
const QA_SKILL = {
  name: "qa-happy-path-skill",
  description:
    "Используй этот скилл, когда пользователь просит проверочный ответ QA для теста поддержки скиллов. Прочитай основную инструкцию скилла и выполни ее.",
  body: `Для проверочного ответа QA напиши ровно одну строку: ${CANARY}. Не добавляй пояснений.`,
};
const QA_PROMPT = "Дай мне проверочный ответ QA для теста поддержки скиллов.";

async function setupSkillsRoom(
  apiSdk: ApiSDK,
): Promise<{ roomId: number; aiFolderId: number }> {
  const ownerApi = apiSdk.forRole("owner");
  const { data: roomData, status: roomStatus } =
    await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: `Autotest Skills Perm Room ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.CustomRoom,
      },
    });
  if (roomStatus !== 200 || !roomData.response?.id) {
    throw new Error(
      `createRoom failed: ${roomStatus} ${JSON.stringify(roomData)}`,
    );
  }
  const roomId = roomData.response.id;

  const { data: aiFolder, status: aiFolderStatus } =
    await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: { title: ".ai" },
    });
  if (aiFolderStatus !== 200 || !aiFolder.response?.id) {
    throw new Error(
      `createFolder('.ai') failed: ${aiFolderStatus} ${JSON.stringify(aiFolder)}`,
    );
  }
  return { roomId, aiFolderId: aiFolder.response.id };
}

async function uploadSkill(
  apiSdk: ApiSDK,
  aiFolderId: number,
  fileName: string,
  skill: { name: string; description: string; body: string },
): Promise<SkillCatalogueEntry> {
  const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n${skill.body}\n`;
  const upload = await uploadFileToFolder(
    apiSdk,
    "owner",
    aiFolderId,
    Buffer.from(content, "utf8"),
    fileName,
    { mimeType: "text/markdown" },
  );
  const fileId = upload.data?.response?.[0]?.id;
  if (upload.status !== 200 || !fileId) {
    throw new Error(
      `uploading skill ${fileName} failed: ${upload.status} ${JSON.stringify(upload.data)}`,
    );
  }
  return {
    id: String(fileId),
    name: skill.name,
    description: skill.description,
  };
}

test.describe("AI Skills permissions - room owner baseline", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - the room Owner can use the room's skill", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, aiFolderId } = await setupSkillsRoom(apiSdk);
    const qaSkill = await uploadSkill(
      apiSdk,
      aiFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );

    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Owner Baseline",
      profileId,
      agentId: roomId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: QA_PROMPT,
      contextRoom: { cloud: "docspace", id: roomId, skills: [qaSkill] },
      timeoutMs: 180000,
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const { data: messages } = await aiChat.readMessages("owner", threadId);
    expectHealthyAssistantReply(messages);

    const toolCalls = AiAgentChat.assistantMessages(messages).flatMap((m) =>
      AiAgentChat.toolCalls(m),
    );
    const readSkillCalls = toolCalls.filter((c) => c.toolName === "read_skill");
    expect(readSkillCalls).toHaveLength(1);
    expect(readSkillCalls[0].args?.id).toBe(qaSkill.id);
    expect(String(readSkillCalls[0].result)).toContain(CANARY);
    expect(AiAgentChat.assistantText(messages)).toContain(CANARY);
  });
});

test.describe("AI Skills permissions - a User invited into the room", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - skills are not owner-only; an invited User can use the room's skill too", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, aiFolderId } = await setupSkillsRoom(apiSdk);
    const qaSkill = await uploadSkill(
      apiSdk,
      aiFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;
    // Default access is ContentCreator — asserted inside the helper, so a
    // refusal below could not be an invite that silently failed.
    await inviteToAgent(ownerApi.rooms, roomId, memberId);
    await aiChat.expectActingAs("user", memberId, "the invited User");

    const profileId = await aiChat.defaultProfileId("user");
    const threadId = await aiChat.createThreadId("user", {
      title: "Autotest Skills Invited User",
      profileId,
      agentId: roomId,
    });

    const sent = await aiChat.sendMessage("user", {
      threadId,
      profileId,
      agentId: roomId,
      message: QA_PROMPT,
      contextRoom: { cloud: "docspace", id: roomId, skills: [qaSkill] },
      timeoutMs: 180000,
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const { data: messages } = await aiChat.readMessages("user", threadId);
    expectHealthyAssistantReply(messages);

    const toolCalls = AiAgentChat.assistantMessages(messages).flatMap((m) =>
      AiAgentChat.toolCalls(m),
    );
    const readSkillCalls = toolCalls.filter((c) => c.toolName === "read_skill");
    expect(readSkillCalls).toHaveLength(1);
    expect(readSkillCalls[0].args?.id).toBe(qaSkill.id);
    expect(String(readSkillCalls[0].result)).toContain(CANARY);
    expect(AiAgentChat.assistantText(messages)).toContain(CANARY);
  });
});

test.describe("AI Skills permissions - no room access", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - an outsider cannot read the victim room's skill by its known id, even spoofing contextRoom", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The attacker is never invited to the victim's room, but somehow knows
    // the skill's real file id, name and description (leaked, guessed, or
    // just small-integer-guessable — DocSpace file ids are sequential). They
    // chat in an entity they legitimately own (their own Documents — a plain
    // User cannot even create a room, confirmed 403 "not enough permission
    // to create"), so the test is purely about whether `read_skill` checks
    // access to the referenced file id, not about the unrelated, already-known
    // crash a stranger gets for merely NAMING a room they cannot open
    // (BUG 82715, chat.permission.spec.ts) — using the victim's roomId as
    // this caller's own entityId would trip that bug instead of answering
    // this one.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, aiFolderId } = await setupSkillsRoom(apiSdk);
    const qaSkill = await uploadSkill(
      apiSdk,
      aiFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );

    // Positive control, taken while the context is still the owner's: the
    // skill really does work for someone who can open the room, so a
    // refusal below is about the attacker's access and not a broken
    // skill/fixture.
    const ownerProfileId = await aiChat.defaultProfileId("owner");
    const ownerThreadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Owner Control",
      profileId: ownerProfileId,
      agentId: roomId,
    });
    const ownerSent = await aiChat.sendMessage("owner", {
      threadId: ownerThreadId,
      profileId: ownerProfileId,
      agentId: roomId,
      message: QA_PROMPT,
      contextRoom: { cloud: "docspace", id: roomId, skills: [qaSkill] },
      timeoutMs: 180000,
    });
    expect(
      ownerSent.status,
      "control: the skill works for the room owner",
    ).toBe(200);
    const ownerMessages = (await aiChat.readMessages("owner", ownerThreadId))
      .data;
    expect(
      AiAgentChat.assistantMessages(ownerMessages).flatMap((m) =>
        AiAgentChat.toolCalls(m),
      ),
      "control",
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "read_skill" }),
      ]),
    );

    const { data: attackerData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const attackerId = attackerData.response!.id!;
    await aiChat.expectActingAs("user", attackerId, "the attacker");

    const myFolder = await apiSdk.forRole("user").folders.getMyFolder();
    expect(myFolder.status, "the attacker's own Documents").toBe(200);
    const ownFolderId = myFolder.data.response!.current!.id!;

    const profileId = await aiChat.defaultProfileId("user");
    const threadId = await aiChat.createThreadId("user", {
      title: "Autotest Skills Attacker Thread",
      profileId,
      agentId: ownFolderId,
    });

    const attack = await aiChat.sendMessage("user", {
      threadId,
      profileId,
      agentId: ownFolderId,
      message: QA_PROMPT,
      // Spoofed: references the VICTIM's room and skill, not anything the
      // attacker actually owns.
      contextRoom: { cloud: "docspace", id: roomId, skills: [qaSkill] },
      timeoutMs: 180000,
    });
    expect(attack.status).toBe(200);
    expect(attack.streamError).toBeUndefined();

    const { data: attackerMessages } = await aiChat.readMessages(
      "user",
      threadId,
    );
    const attackerToolCalls = AiAgentChat.assistantMessages(
      attackerMessages,
    ).flatMap((m) => AiAgentChat.toolCalls(m));
    const attackerReadSkillCalls = attackerToolCalls.filter(
      (c) => c.toolName === "read_skill",
    );

    // Whether or not the model even tries read_skill (it was told, via the
    // spoofed catalogue, that the skill exists, so it usually does), its
    // RESULT must never be the skill's body — that is the actual security
    // boundary, not whether the tool call happened.
    for (const call of attackerReadSkillCalls) {
      expect(
        String(call.result),
        "a foreign skill's body must not come back",
      ).not.toContain(CANARY);
    }
    expect(
      AiAgentChat.assistantText(attackerMessages),
      "the canary must never reach the attacker's final answer",
    ).not.toContain(CANARY);
  });
});

test.describe("AI Skills permissions - anonymous access", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - Anonymous gets 401 and the skill never leaves the server", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, aiFolderId } = await setupSkillsRoom(apiSdk);
    const qaSkill = await uploadSkill(
      apiSdk,
      aiFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );

    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Anonymous Target",
      profileId,
      agentId: roomId,
    });
    const before = await aiChat.getThread("owner", threadId);
    expect(before.status).toBe(200);

    // Anonymous reuses the project's existing send-with-stream auth
    // contract (401 for every unauthenticated caller — see "Threads -
    // anonymous access" in chat.permission.spec.ts); this does not invent a
    // Skills-specific status.
    const sent = await aiChat.sendMessage("anonymous", {
      threadId,
      profileId,
      agentId: roomId,
      message: QA_PROMPT,
      contextRoom: { cloud: "docspace", id: roomId, skills: [qaSkill] },
      timeoutMs: 180000,
    });
    expect(sent.status).toBe(401);
    expect(sent.error).toBe("Unauthorized");
    expect(
      sent.text,
      "the refusal body must not carry the skill's own content",
    ).not.toContain(CANARY);

    // Nothing was written into the thread by the anonymous attempt.
    const after = await aiChat.getThread("owner", threadId);
    expect(after.status).toBe(200);
    expect(after.data?.lastEditDate).toBe(before.data?.lastEditDate);
    const messages = await aiChat.readMessages("owner", threadId);
    expect(AiAgentChat.userMessages(messages.data)).toEqual([]);
    expect(AiAgentChat.assistantMessages(messages.data)).toEqual([]);
  });
});

test.describe("AI Skills permissions - a Guest with room access but no AI Chat", () => {
  test("POST /api/2.0/ai/threads/create, POST /api/2.0/ai/ai/send-with-stream - a Guest with content access to the room still cannot use its skill via chat", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // This is the already-established "chat is off for Guests, by user
    // type, even where they legitimately hold content access" contract (see
    // "Threads - a Guest outside an agent" in chat.permission.spec.ts) —
    // not a new gate invented for Skills. What this test adds is only that
    // it still holds once a `.ai` skill and a `contextRoom` catalogue are in
    // the picture: the Guest must be refused before the Skills mechanism
    // ever gets a chance to run.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, aiFolderId } = await setupSkillsRoom(apiSdk);
    const qaSkill = await uploadSkill(
      apiSdk,
      aiFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );

    // Everything owner-side happens before the Guest authenticates: once it
    // does, the shared context's session cookie outranks any Bearer token a
    // later "owner" call would carry, so an owner call made afterwards would
    // silently run as the Guest instead (and a profile/thread read gated by
    // user type would throw where it should have just worked).
    const profileId = await aiChat.defaultProfileId("owner");
    // A thread the Guest will try to send into — made now, as the owner, so
    // the send refusal below is what is under test, not an owner call that
    // accidentally ran as the Guest.
    const ownerThreadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Guest Send Target",
      profileId,
      agentId: roomId,
    });

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestId = guestData.response!.id!;
    // ContentCreator, not Read: the refusal has to be about the user type,
    // not about an access level that would close an agent too.
    await inviteToAgent(
      ownerApi.rooms,
      roomId,
      guestId,
      FileShare.ContentCreator,
    );
    await aiChat.expectActingAs("guest", guestId, "the Guest");

    // Premise: the invitation landed and the room is genuinely open to this
    // Guest, so a refusal below is the chat gate and not a missing room.
    expect(
      (await apiSdk.forRole("guest").rooms.getRoomInfo({ id: roomId })).status,
      "the Guest can open the room they were invited into",
    ).toBe(200);

    const created = await aiChat.createThread("guest", {
      title: "Autotest Skills Guest Thread",
      profileId,
      agentId: roomId,
    });
    expect(created.status, "a Guest cannot even start a thread here").toBe(403);
    expect(created.threadId).toBe("");

    // Confirm send is refused too, into the thread already made above as
    // the owner — this is the already-asserted-elsewhere send gate, now
    // checked with a Skills catalogue in the body.
    const sent = await aiChat.sendMessage("guest", {
      threadId: ownerThreadId,
      profileId,
      agentId: roomId,
      message: QA_PROMPT,
      contextRoom: { cloud: "docspace", id: roomId, skills: [qaSkill] },
      timeoutMs: 180000,
    });
    expect(sent.status, "a Guest cannot send into any thread here").toBe(403);
    expect(
      sent.text,
      "the refusal body must not carry the skill's content",
    ).not.toContain(CANARY);
  });
});

test.describe("AI Skills permissions - room access revoked", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - a User's skill access disappears once the room invitation is revoked", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, aiFolderId } = await setupSkillsRoom(apiSdk);
    const qaSkill = await uploadSkill(
      apiSdk,
      aiFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;
    await inviteToAgent(ownerApi.rooms, roomId, memberId);
    await aiChat.expectActingAs("user", memberId, "the member");

    const profileId = await aiChat.defaultProfileId("user");
    const threadId = await aiChat.createThreadId("user", {
      title: "Autotest Skills Revoked Access",
      profileId,
      agentId: roomId,
    });

    // Confirm the skill genuinely works before the revoke — otherwise a
    // refusal afterwards would prove nothing about losing access.
    const before = await aiChat.sendMessage("user", {
      threadId,
      profileId,
      agentId: roomId,
      message: QA_PROMPT,
      contextRoom: { cloud: "docspace", id: roomId, skills: [qaSkill] },
      timeoutMs: 180000,
    });
    expect(before.status, "the skill works before the revoke").toBe(200);
    const beforeMessages = (await aiChat.readMessages("user", threadId)).data;
    expect(
      AiAgentChat.assistantMessages(beforeMessages).flatMap((m) =>
        AiAgentChat.toolCalls(m),
      ),
      "control",
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "read_skill" }),
      ]),
    );

    // The owner keeps acting through the SDK client, which carries its own
    // token and is not affected by the shared context's session cookie.
    const revoked = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.None }],
        notify: false,
      },
    });
    expect(revoked.status, "revoking the member's access").toBe(200);

    // Reusing the SAME existing thread on purpose: creating a brand new
    // thread for a since-removed member crashes with 500 instead of
    // refusing (BUG 82858, chat.permission.spec.ts) — an unrelated, already
    // known defect that would block this test from ever reaching
    // send-with-stream. Sending into the thread they already own is the
    // real Skills question: does access get re-checked, not cached.
    const after = await aiChat.sendMessage("user", {
      threadId,
      profileId,
      agentId: roomId,
      message: QA_PROMPT,
      contextRoom: { cloud: "docspace", id: roomId, skills: [qaSkill] },
      timeoutMs: 180000,
    });

    // The wait matters: a send that had gone through would store the user
    // message at once and the reply a few seconds later, so checking right
    // away could mistake a slow write for no write at all.
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const afterMessages = (await aiChat.readMessages("user", threadId)).data;

    // No new reply was added by the post-revoke attempt — the legitimate
    // pre-revoke message is still in `afterMessages` too (same thread), so
    // the count staying put is what proves nothing new came through, not an
    // absence of the canary from the whole history.
    expect(
      AiAgentChat.assistantMessages(afterMessages).length,
      "no new assistant reply after the revoke",
    ).toBe(AiAgentChat.assistantMessages(beforeMessages).length);

    expect(after.status).toBe(403);
    expect(after.error).toBe("Forbidden");
    expect(
      after.streamError,
      "the refusal is the status, not a stream frame",
    ).toBeUndefined();
  });
});
