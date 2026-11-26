import { expect } from "@playwright/test";
import { FileShare, RoomType, SearchArea } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";
import { AiAgentChat, AiProfile } from "./ai-agent-chat";

// An agent in DocSpace 4.1.0 is an AI project: a room of type 12
// (RoomType.AiProjectRoom) in the AI rooms section. The interface calls it an
// agent; the server, the SDK and the routes call it a project. It is built the
// way the client builds it:
//
//   POST /api/2.0/files/rooms            { title, tags, color, cover, roomType: 12 }
//   PUT  /api/2.0/files/rooms/{id}/model { profileId }
//   GET  /api/2.0/files/rooms?searchArea=AiHub&type=12   -> the agents list
//
// The old agent (roomType 9, /api/2.0/ai/agents) is gone: those routes are
// internal on the server and answer 404 from outside. An agent has no prompt of
// its own and no quota: `chatSettings` and `quota` are refused (400) on create
// and update. Its instructions are the skills of the Instructions rooms linked
// to it (roomsAI.linkProjectSources).

type RoleApi = ReturnType<ApiSDK["forRole"]>;

/** Creates an agent and, when a profile is given, fixes its model. */
export async function createAgentId(
  apiSdk: ApiSDK,
  role: Role,
  body: { title?: string; tags?: string[]; profileId?: string } = {},
): Promise<number> {
  const api = apiSdk.forRole(role);
  const title =
    body.title ?? `Autotest Agent ${apiSdk.faker.generateString(6)}`;

  const { data, status } = await api.rooms.createRoom({
    createRoomRequestDto: {
      title,
      roomType: RoomType.AiProjectRoom,
      tags: body.tags,
    },
  });
  if (status !== 200 || !data.response?.id) {
    throw new Error(
      `createRoom(${title}, type=AiProjectRoom) as ${role} failed: ${status} ${JSON.stringify(data)}`,
    );
  }
  const agentId = data.response.id;

  if (body.profileId) {
    const { status: modelStatus } = await api.roomsAI.setProjectModel({
      id: agentId,
      updateAiProjectModelRequest: { profileId: body.profileId },
    });
    expect(modelStatus, `setting the model of agent ${agentId}`).toBe(200);
  }

  return agentId;
}

/** The agent's own model as a profile id; null while none is selected. */
export async function agentModel(
  api: RoleApi,
  agentId: number,
): Promise<string | null> {
  const { data, status } = await api.roomsAI.getProjectModel({ id: agentId });
  expect(status, `GET /files/rooms/${agentId}/model`).toBe(200);
  // With no model selected the answer carries no profile id at all: measured
  // both as a null `response` and as a `response` without `profileId`.
  return data.response?.profileId ?? null;
}

/** Ids of the agents the caller sees in the AI rooms section. */
export async function listedAgentIds(api: RoleApi): Promise<number[]> {
  const { data, status } = await api.rooms.getRoomsFolder({
    searchArea: SearchArea.AiHub,
    type: [RoomType.AiProjectRoom],
    count: 100,
  });
  expect(status, "GET /files/rooms?searchArea=AiHub&type=12").toBe(200);
  return (data.response?.folders ?? []).map(
    (folder) => (folder as { id?: number }).id!,
  );
}

/** Ids of the rooms the caller sees in the Rooms section. */
export async function listedRoomIds(api: RoleApi): Promise<number[]> {
  const { data, status } = await api.rooms.getRoomsFolder({
    searchArea: SearchArea.Active,
    count: 100,
  });
  expect(status, "GET /files/rooms?searchArea=Active").toBe(200);
  return (data.response?.folders ?? []).map(
    (folder) => (folder as { id?: number }).id!,
  );
}

/** Invites a user into an agent; an agent offers Content creator only. */
export async function inviteToAgent(
  api: RoleApi,
  agentId: number,
  userId: string,
  access: FileShare = FileShare.ContentCreator,
) {
  const { status } = await api.rooms.setRoomSecurity({
    id: agentId,
    roomInvitationRequest: {
      invitations: [{ id: userId, access }],
      notify: false,
    },
  });
  expect(status, `inviting ${userId} into agent ${agentId}`).toBe(200);
}

/** Ids of the users the agent lists as members. */
export async function agentMemberIds(
  api: RoleApi,
  agentId: number,
): Promise<string[]> {
  const { data, status } = await api.rooms.getRoomSecurityInfo({
    id: agentId,
  });
  expect(status, `GET /files/rooms/${agentId}/share`).toBe(200);
  return (data.response ?? [])
    .map(
      (share) => (share as { sharedTo?: { id?: string } }).sharedTo?.id ?? "",
    )
    .filter(Boolean);
}

/** True when an image-only or other non-chat profile, by either signal. */
function isTextProfile(profile: AiProfile): boolean {
  return (
    !!profile.id &&
    !!profile.modelId &&
    profile.canUseTool !== false &&
    !AiAgentChat.NON_TEXT_MODEL_MARKERS.some((marker) =>
      profile.modelId.toLowerCase().includes(marker),
    )
  );
}

/**
 * Profiles for the model tests: two different chat profiles, and an image-only
 * one (`canUseTool: false`), which an agent must refuse.
 */
export async function agentProfiles(apiSdk: ApiSDK) {
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profiles = await aiChat.listProfiles("owner");

  const chat = AiAgentChat.pickTextProfile(profiles);
  const other = profiles
    .filter((profile) => isTextProfile(profile) && profile.id !== chat.id)
    .sort((a, b) => a.modelId.localeCompare(b.modelId))[0];
  if (!other) {
    throw new Error(
      `The catalogue has one chat profile, the tests need two: ${JSON.stringify(profiles)}`,
    );
  }

  const image = profiles.find((profile) => profile.canUseTool === false);

  return { chat: chat.id, other: other.id, image: image?.id };
}
