import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  agentModel,
  agentProfiles,
  createAgentId,
} from "@/src/helpers/ai-agents";

// An agent with portal AI access switched off. An agent is an AI project, a
// room of type 12 (see src/helpers/ai-agents.ts): creating one needs AI on, and
// its model routes answer 403 while AI is off (server: FileStorageService
// `CheckAiProjectRoomCreationAsync`, AiHubController docs).
//
// Each test proves a transition, not an end state: the route answers 200 with AI
// on, the switch is flipped and read back, and only then is the 403 asserted. A
// bare 403 would also pass on a portal where the route is refused for an
// unrelated reason.

type OwnerApi = Parameters<typeof setPortalAiAccess>[0];

/** Flips the portal AI switch off and proves it actually stored the value. */
async function turnAiOff(ownerApi: OwnerApi) {
  const result = await setPortalAiAccess(ownerApi, false);
  expect(result.writeStatus, "PUT /settings/ai-access {enabled:false}").toBe(
    200,
  );
  expect(result.enabled, "ai-access read back after disabling").toBe(false);
}

/** Back on, so the refused write can be checked for side effects. */
async function turnAiOn(ownerApi: OwnerApi) {
  const result = await setPortalAiAccess(ownerApi, true);
  expect(result.writeStatus, "PUT /settings/ai-access {enabled:true}").toBe(
    200,
  );
  expect(result.enabled, "ai-access read back after re-enabling").toBe(true);
}

test.describe("AI Agents - AI Disabled", () => {
  test("POST /files/rooms - an agent cannot be created while AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    // Positive control: the same create succeeds with AI on.
    await createAgentId(apiSdk, "owner");

    await turnAiOff(ownerApi);

    const { status } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Agent AI Off",
        roomType: RoomType.AiProjectRoom,
      },
    });

    expect(status).toBe(403);
  });

  test("GET /files/rooms/:id/model - an agent's model is unreadable while AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });
    expect(await agentModel(ownerApi, agentId)).toBe(chat);

    await turnAiOff(ownerApi);

    const { status } = await ownerApi.roomsAI.getProjectModel({ id: agentId });
    expect(status).toBe(403);
  });

  test("PUT /files/rooms/:id/model - an agent's model cannot be changed while AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const { chat, other } = await agentProfiles(apiSdk);
    const agentId = await createAgentId(apiSdk, "owner", { profileId: chat });

    await turnAiOff(ownerApi);

    const { status } = await ownerApi.roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: { profileId: other },
    });
    expect(status).toBe(403);

    await turnAiOn(ownerApi);
    expect(await agentModel(ownerApi, agentId)).toBe(chat);
  });

  test("GET /ai/profiles/list - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const before = await aiChat.getProfiles("owner");
    expect(before.status).toBe(200);
    expect(Array.isArray(before.data)).toBe(true);

    await turnAiOff(ownerApi);

    // An empty array would also be what a 403 body normalises to, so the
    // catalogue call is asserted on its status and error, not on its payload.
    const { status, error } = await aiChat.getProfiles("owner");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });
});
