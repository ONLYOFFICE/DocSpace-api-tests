import { expect } from "@playwright/test";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { uploadFileToFolder } from "@/src/helpers/upload-file";

// AI Skills: PAUSED, not a real test suite yet.
//
// The feature ("drop a file in a `.ai` folder inside a Room, it becomes an
// AI-readable skill") has no footprint anywhere in this repo, in any SDK
// type, or in any route map collected from prior AI-stack investigation
// sessions. Measured on a live portal on 2026-10-01 with the two probes
// below (soft-asserted, console.log-driven, so a wrong guess about the
// contract doesn't just fail the run): creating `.ai` and uploading a
// skill-shaped YAML (front-matter `name`/`description` + a marker in the
// body) behaves as completely ordinary file/folder operations — no special
// FolderType, no special file security flags — and a chat message that
// should trigger the skill gets answered from the model's own general
// knowledge: zero tool calls, no `tool-call-pending` frame, the marker never
// appears. A `.ai` folder inside an agent's own room can't even be created
// (403 — same rule as any other folder at that root). Full writeup:
// see memory note ai_skills_feature_not_observable_2026_10_01.
//
// Decision (2026-10-01): pause here. The feature is not deployed to test
// stands yet, so there is nothing real to assert against — writing the full
// checklist now would mean inventing a contract. Resume once the stands are
// updated: drop `.skip`, re-run both probes to confirm what (if anything)
// changed, then replace them with the real test suite.

const SKILL_YAML = `---
name: Pirate
description: Answer using the Pirate skill when asked to speak like a pirate.
---
Always include the exact marker SKILL_APPLIED_7391 in the final answer.
`;

test.describe
  .skip("AI Skills - investigation probes (paused, feature not deployed yet)", () => {
  test("INVESTIGATION - .ai folder + skill file discovery", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(540000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const { data: roomData, status: roomStatus } =
      await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Skills Room",
          roomType: RoomType.CustomRoom,
        },
      });
    console.log("createRoom status:", roomStatus, "id:", roomData.response?.id);
    const roomId = roomData.response!.id!;

    const { data: aiFolder, status: aiFolderStatus } =
      await ownerApi.folders.createFolder({
        folderId: roomId,
        createFolder: { title: ".ai" },
      });
    console.log(
      "createFolder('.ai') status:",
      aiFolderStatus,
      "response:",
      JSON.stringify(aiFolder),
    );
    const aiFolderId = aiFolder.response?.id;

    const { data: roomContents, status: roomContentsStatus } =
      await ownerApi.folders.getFolderByFolderId({ folderId: roomId });
    console.log(
      "room contents status:",
      roomContentsStatus,
      "folders:",
      JSON.stringify(
        (roomContents.response?.folders ?? []).map((f: any) => ({
          id: f.id,
          title: f.title,
          type: f.rootFolderType ?? f.type,
        })),
      ),
    );

    if (!aiFolderId) {
      console.log("No .ai folder id — aborting probe early.");
      return;
    }

    const upload = await uploadFileToFolder(
      apiSdk,
      "owner",
      aiFolderId,
      Buffer.from(SKILL_YAML, "utf8"),
      "pirate.yml",
      { mimeType: "application/x-yaml" },
    );
    console.log("upload pirate.yml status:", upload.status);
    console.log("upload response:", JSON.stringify(upload.data));

    // Give any async indexing a moment.
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const { data: aiFolderContents, status: aiFolderContentsStatus } =
      await ownerApi.folders.getFolderByFolderId({ folderId: aiFolderId });
    console.log(
      ".ai folder contents status:",
      aiFolderContentsStatus,
      "files:",
      JSON.stringify(
        (aiFolderContents.response?.files ?? []).map((f: any) => ({
          id: f.id,
          title: f.title,
        })),
      ),
    );

    const profileId = await aiChat.defaultProfileId("owner");

    // Try the room itself as the entityId scope (no dedicated agent) first —
    // the room is where `.ai` physically lives.
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Thread",
      profileId,
      agentId: roomId,
    });
    console.log("threadId (entityId=room):", threadId);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Please speak like a pirate in your answer.",
      timeoutMs: 180000,
    });
    console.log("send status:", sent.status, "streamError:", sent.streamError);
    console.log(
      "frameTypes:",
      JSON.stringify(AiAgentChat.frameTypes(sent.text)),
    );
    const pending = AiAgentChat.pendingToolCall(sent.text);
    console.log("pendingToolCall:", JSON.stringify(pending));

    const { data: messages } = await aiChat.readMessages("owner", threadId);
    const assistantText = AiAgentChat.assistantText(messages);
    console.log("assistantText:", assistantText);
    console.log(
      "contains SKILL_APPLIED_7391:",
      assistantText.includes("SKILL_APPLIED_7391"),
    );
    const toolCalls = AiAgentChat.assistantMessages(messages).flatMap((m) =>
      AiAgentChat.toolCalls(m),
    );
    console.log("toolCalls:", JSON.stringify(toolCalls));

    expect(roomStatus).toBe(200);
  });

  test("INVESTIGATION - .ai folder inside an agent's own room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(540000);
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Skills Agent",
      profileId,
    });
    console.log("agentId:", agentId);

    const { data: agentFolders, status: agentFoldersStatus } =
      await ownerApi.folders.getFolders({ folderId: agentId });
    console.log(
      "agent's existing subfolders status:",
      agentFoldersStatus,
      "folders:",
      JSON.stringify(
        (
          (agentFolders.response ?? []) as Array<{
            id?: number;
            title?: string;
            type?: number;
          }>
        ).map((f) => ({ id: f.id, title: f.title, type: f.type })),
      ),
    );

    const { data: aiFolder, status: aiFolderStatus } =
      await ownerApi.folders.createFolder({
        folderId: agentId,
        createFolder: { title: ".ai" },
      });
    console.log(
      "createFolder('.ai') in agent room status:",
      aiFolderStatus,
      "id:",
      aiFolder.response?.id,
      "type:",
      (aiFolder.response as any)?.type,
    );
    const aiFolderId = aiFolder.response?.id;
    if (!aiFolderId) {
      console.log("No .ai folder id in agent room — aborting probe early.");
      return;
    }

    const upload = await uploadFileToFolder(
      apiSdk,
      "owner",
      aiFolderId,
      Buffer.from(SKILL_YAML, "utf8"),
      "pirate.yml",
      { mimeType: "application/x-yaml" },
    );
    console.log("upload pirate.yml (agent room) status:", upload.status);

    await new Promise((resolve) => setTimeout(resolve, 5000));

    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest Skills Agent Thread",
      profileId,
      agentId,
    });
    console.log("threadId (entityId=agent):", threadId);

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: "Please speak like a pirate in your answer.",
      timeoutMs: 180000,
    });
    console.log("send status:", sent.status, "streamError:", sent.streamError);
    console.log(
      "frameTypes:",
      JSON.stringify(AiAgentChat.frameTypes(sent.text)),
    );
    const pending = AiAgentChat.pendingToolCall(sent.text);
    console.log("pendingToolCall:", JSON.stringify(pending));

    const { data: messages } = await aiChat.readMessages("owner", threadId);
    const assistantText = AiAgentChat.assistantText(messages);
    console.log("assistantText:", assistantText);
    console.log(
      "contains SKILL_APPLIED_7391:",
      assistantText.includes("SKILL_APPLIED_7391"),
    );
    const toolCalls = AiAgentChat.assistantMessages(messages).flatMap((m) =>
      AiAgentChat.toolCalls(m),
    );
    console.log("toolCalls:", JSON.stringify(toolCalls));

    expect(agentId).toBeGreaterThan(0);
  });
});
