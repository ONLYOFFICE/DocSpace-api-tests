import { expect } from "@playwright/test";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  AiAgentChat,
  HostTool,
  expectHealthyAssistantReply,
} from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { AiAttachments } from "@/src/helpers/ai-attachments";
import {
  attachDocSpaceFile,
  expectDeviceFileStored,
} from "@/src/helpers/device-upload";
import { createNextcloudRoom } from "@/src/helpers/third-party";
import { ApiSDK } from "@/src/services/api-sdk";

// Third-party rooms — [[third_party_rooms_api_contract]] — meet the AI stack.
//
// A third-party room's own id IS its provider folder id ("sbox-<n>"), and it is
// created as an ordinary RoomType (CustomRoom by default here), not the AiRoom
// type ([[ai_room_via_rooms_api_is_not_an_agent]]). Every AI surface treats
// `entityId` as an opaque string — [[ai_entity_context_shared_bucket]] already
// establishes that a room id, a folder id and no id at all collapse into one
// shared thread bucket — so the question this file asks is narrower: does that
// same machinery still work when the id in question resolves to a WebDav-backed
// folder instead of an internal one, for threads, for MCP tool scoping, and for
// attaching a file that physically lives on the third-party storage.
//
// Every case here connects a *fresh* Nextcloud account per room
// ([[third_party_rooms_api_contract]]'s "one connection = one room" rule), using
// the real `config.NEXTCLOUD_*` credentials `createNextcloudRoom` wraps — see
// [[third_party_accounts_cannot_be_provisioned_on_test_portals]].

/** Invites a member into any room (not only an agent room) at a given access level. */
async function inviteToRoom(
  ownerApi: ReturnType<ApiSDK["forRole"]>,
  roomId: string | number,
  userId: string,
  access: FileShare = FileShare.Read,
) {
  const { status } = await ownerApi.rooms.setRoomSecurity({
    id: roomId as unknown as number,
    roomInvitationRequest: {
      invitations: [{ id: userId, access }],
      notify: false,
    },
  });
  expect(status, `inviting ${userId} into room ${roomId}`).toBe(200);
}

async function setupThirdPartyRoom(apiSdk: ApiSDK, title: string) {
  const ownerApi = apiSdk.forRole("owner");
  const { roomId } = await createNextcloudRoom(
    apiSdk,
    "owner",
    title,
    RoomType.CustomRoom,
  );
  return { ownerApi, roomId };
}

test.describe("Third-party rooms — AI thread scoping", () => {
  test("POST /api/2.0/ai/threads/create - a thread scoped to a third-party room is stored and answers a real message", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP Thread Room",
    );

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest TP thread",
      profileId,
      agentId: roomId,
    });

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "Reply with the single word: acknowledged",
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const messages = await aiChat.waitForAssistantReply("owner", threadId);
    expectHealthyAssistantReply(messages);

    const { status, data } = await aiChat.listThreads("owner", roomId);
    expect(status).toBe(200);
    expect(data.map((thread) => thread.threadId)).toContain(threadId);
  });

  test("GET /api/2.0/ai/threads/list - a third-party room's thread falls into the same shared bucket as an internal room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Pins that the shared-bucket behaviour of BUG 82855
    // ([[ai_entity_context_shared_bucket]]) is a property of `entityId` being a
    // room/folder id at all — not of the id resolving to internal storage. If a
    // fix ever scoped threads correctly for internal rooms but missed
    // third-party ones (or the reverse), this is what would catch the split.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP Bucket Room",
    );
    const { data: internalRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Internal Sibling Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const internalRoomId = internalRoom.response!.id!;

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest bucket thread",
      profileId,
      agentId: roomId,
    });

    const fromInternalRoom = await aiChat.listThreads("owner", internalRoomId);
    const fromNoEntity = await aiChat.listThreads("owner");

    expect(
      fromInternalRoom.data.map((thread) => thread.threadId),
      "an unrelated internal room's list carries the third-party room's thread",
    ).toContain(threadId);
    expect(
      fromNoEntity.data.map((thread) => thread.threadId),
      "so does the no-entity list",
    ).toContain(threadId);
  });

  test("GET /api/2.0/ai/threads/list - a non-member of a third-party room gets the same 500 a non-member of an internal room gets", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Same root cause as the room/folder 500 in
    // [[ai_entity_context_shared_bucket]] (filed there against internal rooms) —
    // reusing that number rather than filing a new one, per
    // [[feedback_bug_placeholder_before_filing]] this is only correct if the
    // failure mode actually matches once run live.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP NonMember Room",
    );

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    await aiChat.createThreadId("owner", {
      title: "Autotest non-member thread",
      profileId,
      agentId: roomId,
    });

    const { status: memberStatus, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    expect(memberStatus).toBe(200);

    // The room read itself is refused for a non-member ...
    const roomRead = await userApi.rooms.getRoomInfo({
      id: roomId as unknown as number,
    });
    expect(roomRead.status, "reading the room as a non-member").toBe(403);

    // ... and asking for its threads is expected to refuse the same way.
    const list = await aiChat.listThreads("user", roomId);
    expect(list.status, "listing threads as a non-member").toBe(403);
  });
});

test.describe("Third-party rooms — MCP tool scoping", () => {
  const SERVER_CONFIG = { url: "https://mcp.example.invalid/sse" };

  test("POST/GET /api/2.0/ai/tools/*-custom-server - a custom MCP server can be scoped to a third-party room, and is readable by name", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP MCP Scope Room",
    );

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);

    const { data: added, status: addStatus } = await aiTools.addCustomServer(
      "owner",
      { name: "tp-room-server", config: SERVER_CONFIG, agentId: roomId },
    );
    expect(addStatus).toBe(200);
    expect(added?.success).toBe(true);

    const { data: forRoom } = await aiTools.listCustomServers("owner", roomId);
    const { data: single, status: getStatus } = await aiTools.getCustomServer(
      "owner",
      "tp-room-server",
      roomId,
    );

    expect(Object.keys(forRoom)).toContain("tp-room-server");
    expect(forRoom["tp-room-server"]).toEqual(SERVER_CONFIG);
    expect(getStatus).toBe(200);
    expect(single).toEqual(SERVER_CONFIG);
  });

  test("BUG 82975: GET /api/2.0/ai/tools/list-custom-servers - a server scoped to a third-party room is also visible on the portal-wide, unscoped read", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Same defect as the plain-internal-room case already filed as BUG 82975
    // (mcp.spec.ts, "a server registered for a room is also served portal-wide"),
    // confirmed live 2026-08-20 to reproduce on a third-party room too: a
    // third-party room's own id is not numeric ("sbox-<n>"), but that doesn't
    // matter — any non-agent entityId (numeric room id or "sbox-<n>" alike) ends
    // up readable from a bare `listCustomServers("owner")` call with no entityId
    // at all, i.e. from every agent and every other room on the portal, not just
    // from a sibling room (see the next test for that narrower leak). Not a new,
    // third-party-specific bug — kept here as an additional repro for 82975
    // against a third-party-backed room, since that combination wasn't covered
    // before.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP MCP Portal Leak Room",
    );

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    await aiTools.addCustomServer("owner", {
      name: "tp-room-portal-leak-server",
      config: SERVER_CONFIG,
      agentId: roomId,
    });

    const { data: portalWide } = await aiTools.listCustomServers("owner");

    test.fail();
    expect(
      Object.keys(portalWide),
      "a room-scoped server must not be readable from the unscoped, portal-wide list",
    ).not.toContain("tp-room-portal-leak-server");
  });

  test("BUG 82975: GET /api/2.0/ai/tools/list-custom-servers - a server scoped to a third-party room leaks into an unrelated internal room's scope", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Filed under the same BUG 82975 as the portal-wide leak above, on the bet
    // that one fix resolves both: confirmed live 2026-08-20 that this is not
    // third-party-specific — the same probe against two plain internal
    // CustomRooms (no third-party storage involved at all) leaks the exact same
    // way, so the underlying defect looks like the same one — a non-agent
    // entityId is not really used as a distinct key, only "is it an agent" and
    // "is entityId present at all" seem to be checked. Kept here rather than
    // only as a general mcp.spec.ts case because it is exactly the case this
    // file's coverage was asked for: whether a third-party room's own scope is
    // safe from a sibling room reading its MCP server config. It is not — a
    // server meant for one connected storage's room is visible from a room
    // that has nothing to do with it. If 82975's fix does NOT clear this test
    // too, split it back out under its own bug number.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP MCP Leak Room",
    );
    const { data: internalRoom } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest MCP Sibling Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const internalRoomId = internalRoom.response!.id!;

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    await aiTools.addCustomServer("owner", {
      name: "tp-room-leaky-server",
      config: SERVER_CONFIG,
      agentId: roomId,
    });

    const { data: forSibling } = await aiTools.listCustomServers(
      "owner",
      internalRoomId,
    );

    test.fail();
    expect(
      Object.keys(forSibling),
      "an unrelated room must not see a server scoped to a different room",
    ).not.toContain("tp-room-leaky-server");
  });

  test("POST /api/2.0/ai/tools/add-custom-server - a non-admin member of a third-party room is refused", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP MCP Perm Room",
    );

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = memberData.response!.id!;
    await inviteToRoom(ownerApi, roomId, userId, FileShare.Read);

    const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
    const { status } = await aiTools.addCustomServer("user", {
      name: "tp-room-should-fail",
      config: SERVER_CONFIG,
      agentId: roomId,
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a client-supplied tool pauses and resumes in a thread scoped to a third-party room", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP Tool Pause Room",
    );

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const threadId = await aiChat.createThreadId("owner", {
      title: "Autotest TP tool thread",
      profileId,
      agentId: roomId,
    });

    const WEATHER_TOOL: HostTool = {
      name: "get_weather",
      description: "Get the current weather for a city.",
      inputSchema: {
        type: "object",
        properties: { city: { type: "string", description: "City name" } },
        required: ["city"],
        additionalProperties: false,
      },
      enabled: true,
      requireApproval: true,
    };

    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: roomId,
      message: "What is the weather in Paris? Call the get_weather tool.",
      tools: [WEATHER_TOOL],
    });
    expect(sent.status).toBe(200);
    expect(sent.streamError).toBeUndefined();

    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `the model did not ask for the tool; frames were ${AiAgentChat.frameTypes(sent.text).join(", ")}`,
    ).toBeDefined();

    const approve = await aiChat.approvePendingToolCall("owner", pending!, {
      threadId,
      profileId,
      agentId: roomId,
      tools: [WEATHER_TOOL],
      result: "21C and sunny",
    });
    expect(approve.status).toBe(200);
    expect(AiAgentChat.frameTypes(approve.text)).toContain("message-end");

    const messages = await aiChat.readMessages("owner", threadId);
    const reply = AiAgentChat.assistantMessages(messages.data)[0];
    expect(AiAgentChat.toolCalls(reply)[0].result).toBe("21C and sunny");
  });
});

test.describe("Third-party rooms — chat attachments", () => {
  const MARKER = "TP-ATTACH-MARKER";

  test("POST /api/2.0/ai/attachments/save-file - a file stored on the third-party backend attaches like any DocSpace file", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP Attach Room",
    );

    const stored = await expectDeviceFileStored(
      apiSdk,
      "owner",
      roomId,
      `autotest-tp-${apiSdk.faker.generateString(6)}.txt`,
      Buffer.from(`Document body. ${MARKER}`, "utf8"),
      "text/plain",
    );

    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const attached = await attachDocSpaceFile(
      attachments,
      "owner",
      stored.id,
      stored.title,
    );

    expect(attached.status).toBe(200);
    expect(String(attached.data?.content)).toContain(MARKER);
  });

  test("POST /api/2.0/ai/attachments/save-file - a non-member of the third-party room cannot attach its file by id", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { roomId } = await setupThirdPartyRoom(
      apiSdk,
      "Autotest TP Attach Perm Room",
    );

    const stored = await expectDeviceFileStored(
      apiSdk,
      "owner",
      roomId,
      `autotest-tp-guarded-${apiSdk.faker.generateString(6)}.txt`,
      Buffer.from(`Document body. ${MARKER}`, "utf8"),
      "text/plain",
    );

    const { status: memberStatus } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    expect(memberStatus).toBe(200);

    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const attached = await attachDocSpaceFile(
      attachments,
      "user",
      stored.id,
      stored.title,
    );

    expect(
      attached.status,
      "a user never invited to the room cannot read its file through save-file",
    ).not.toBe(200);
  });
});
