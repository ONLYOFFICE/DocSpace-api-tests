import { expect } from "@playwright/test";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  AiAgentChat,
  SkillCatalogueEntry,
  expectHealthyAssistantReply,
} from "@/src/helpers/ai-agent-chat";
import { uploadFileToFolder } from "@/src/helpers/upload-file";
import { getRoomAiFolder, setupSkillsRoom } from "@/src/helpers/room-skills";
import { ApiSDK } from "@/src/services/api-sdk";

// AI Skills: a `.ai` folder's files become a per-room skill catalogue, but
// the backend does not discover it by itself. `POST /ai/ai/send-with-stream`
// needs the catalogue handed to it explicitly, on every call, as
//
//   actionArgs.contextRoom = {
//     cloud: "docspace",
//     id: <roomId>,
//     skills: [{ id: <skillFileId>, name, description }, ...],
//   }
//
// `id` is the skill FILE's real DocSpace file id; `name`/`description` are
// copied from its YAML front matter. Given that catalogue — and nothing
// else: no instruction to search, no hint to call a tool — the model picks
// the matching skill by its `description` and calls the internal
// `read_skill` tool with that skill's `id`. The tool's result is the whole
// skill file, body included; the model then follows the body's instruction.
//
// Measured live on 2026-10-06 by reproducing a UI network capture
// (`entityId` alone, without `contextRoom`, is NOT the full contract — every
// earlier attempt without it made the model fall back to its generic
// DocSpace REST tools, `get_folder_content`/`download_file_as_text`, to
// manually browse for the file. That is ordinary file browsing, not the
// Skills mechanism, and none of the tests below rely on it).
//
// Separate, unfiled discrepancy, deliberately not mixed into these tests: a
// `.yml` file with identical, valid front matter never showed up in the UI's
// own Skills picker — only `.md` did. Every skill fixture here is `.md`.

const CANARY = "СКИЛЛ ПРОЧИТАН: СИНИЙ ЕНОТ 7429";

const QA_SKILL = {
  name: "qa-happy-path-skill",
  description:
    "Используй этот скилл, когда пользователь просит проверочный ответ QA для теста поддержки скиллов. Прочитай основную инструкцию скилла и выполни ее.",
  body: `Для проверочного ответа QA напиши ровно одну строку: ${CANARY}. Не добавляй пояснений.`,
};

const DUMMY_SKILL = {
  name: "weather-briefing",
  description:
    "Используй этот скилл, когда пользователь просит сводку погоды или прогноз погоды на день.",
  body: "Всегда отвечай ровно одной строкой: ПОГОДА: ЯСНО, 21°C. Не добавляй пояснений.",
};

/** Generic DocSpace REST tools the model reaches for when given no skill
 * metadata and told to go look for something — the fallback the happy path
 * must not need. */
const GENERIC_FILE_TOOLS = [
  "get_folder_content",
  "download_file_as_text",
  "get_my_folder",
  "get_rooms_folder",
];

async function uploadSkill(
  apiSdk: ApiSDK,
  skillsFolderId: number,
  fileName: string,
  skill: { name: string; description: string; body: string },
): Promise<SkillCatalogueEntry> {
  const content = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n${skill.body}\n`;
  const upload = await uploadFileToFolder(
    apiSdk,
    "owner",
    skillsFolderId,
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

// Skipped while the AI tool surface is under active development. What is
// observed, 2026-11-17: the model answers but calls nothing at all - not
// `read_skill`, and not the generic DocSpace file tools these tests assume the
// happy path could have fallen back on. Alongside that,
// `GET /ai/tools/list-system-tools` answers `{"groups":{},"errors":{},
// "system":[]}` on a fresh portal, reporting no tools and no error fetching
// them. The two fit together but the link is not proven here: the MCP suite
// has the model reaching for a server-side tool of its own accord, so an empty
// answer from that endpoint is not on its own the whole story.
//
// Nothing below needs changing when tools come back - re-enable and run.
test.describe("AI Skills - the room skills catalogue + read_skill contract", () => {
  test.skip("POST /api/2.0/ai/ai/send-with-stream - a matching prompt makes the model call read_skill for the right skill", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, skillsFolderId } = await setupSkillsRoom(
      apiSdk,
      "Autotest Skills Room",
    );
    const qaSkill = await uploadSkill(
      apiSdk,
      skillsFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );

    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Happy Path",
      profileId,
      agentId: roomId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Дай мне проверочный ответ QA для теста поддержки скиллов.",
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
    expect(
      readSkillCalls,
      `the model must call read_skill; tool calls were ${JSON.stringify(toolCalls.map((c) => c.toolName))}`,
    ).toHaveLength(1);
    expect(readSkillCalls[0].args?.id).toBe(qaSkill.id);
    expect(String(readSkillCalls[0].result)).toContain(CANARY);

    expect(
      toolCalls.map((c) => c.toolName),
      "the happy path must not need generic file browsing",
    ).not.toEqual(expect.arrayContaining(GENERIC_FILE_TOOLS));

    // The model sometimes narrates ("I'll read the skill instructions...")
    // before the canary even with a single skill in play — pure model
    // chattiness, unrelated to whether the body was really read. That is
    // already proven above by the read_skill call itself (right id, result
    // containing the canary), so this only checks the canary made it into
    // the final answer, not that nothing else did.
    expect(AiAgentChat.assistantText(messages)).toContain(CANARY);
  });

  // Skipped with its positive twin above, and for a sharper reason: with no
  // tool to call, "the model did not read the skill" holds whatever the model
  // does. Left running it would be a green that cannot turn red.
  test.skip("POST /api/2.0/ai/ai/send-with-stream - an unrelated prompt does not read the skill", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, skillsFolderId } = await setupSkillsRoom(
      apiSdk,
      "Autotest Skills Room",
    );
    const qaSkill = await uploadSkill(
      apiSdk,
      skillsFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );

    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Negative",
      profileId,
      agentId: roomId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Сколько будет 2 + 2?",
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
    expect(
      toolCalls.filter((c) => c.toolName === "read_skill"),
      "an irrelevant prompt must not read an unrelated skill",
    ).toHaveLength(0);
  });

  test.skip("POST /api/2.0/ai/ai/send-with-stream - among several skills, the model reads only the one matching the prompt", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { roomId, skillsFolderId } = await setupSkillsRoom(
      apiSdk,
      "Autotest Skills Room",
    );
    const qaSkill = await uploadSkill(
      apiSdk,
      skillsFolderId,
      "qa-happy-path-skill.md",
      QA_SKILL,
    );
    const dummySkill = await uploadSkill(
      apiSdk,
      skillsFolderId,
      "weather-briefing.md",
      DUMMY_SKILL,
    );

    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Discrimination",
      profileId,
      agentId: roomId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Дай мне проверочный ответ QA для теста поддержки скиллов.",
      contextRoom: {
        cloud: "docspace",
        id: roomId,
        skills: [qaSkill, dummySkill],
      },
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
    expect(readSkillCalls, "exactly one skill must be read").toHaveLength(1);
    expect(
      readSkillCalls[0].args?.id,
      "the model must pick the QA skill, not the weather one",
    ).toBe(qaSkill.id);
    expect(readSkillCalls[0].args?.id).not.toBe(dummySkill.id);

    // Unlike the single-skill happy path, the model sometimes narrates its
    // choice before the canary when more than one skill is in play — the
    // discrimination contract is which skill got read, not the exact final
    // text, so this only checks the canary is present.
    expect(AiAgentChat.assistantText(messages)).toContain(CANARY);
  });
});

test.describe("GET /files/rooms/{id}/ai - the room's skills folder listing", () => {
  test("GET /files/rooms/{id}/ai - An Instructions room returns its (empty) skills listing", async ({
    apiSdk,
  }) => {
    const { roomId } = await setupSkillsRoom(apiSdk, "Autotest Skills Room");

    const { status, data } = await getRoomAiFolder(apiSdk, roomId);
    expect(status).toBe(200);
    expect(data.response?.files).toEqual([]);
  });

  test("BUG 84329: GET /files/rooms/{id}/ai - A room of any other kind has no skills folder to list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: `Autotest Skills Not Instructions ${apiSdk.faker.generateString(6)}`,
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    // Skills belong to Instructions rooms, and the listing is scoped to them
    // rather than to a folder anyone may create. Putting a folder named `.ai`
    // in this room by hand - which used to be the mechanism, and is what BUG
    // 84329's workaround relied on - does not open it either.
    const { status } = await getRoomAiFolder(apiSdk, roomId);
    expect(status).toBe(404);

    const { status: created } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolderRequest: { title: ".ai" },
    });
    expect(created).toBe(200);
    expect((await getRoomAiFolder(apiSdk, roomId)).status).toBe(404);
  });
});
