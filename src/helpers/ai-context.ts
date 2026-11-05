import { expect } from "@playwright/test";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { AiHttp, AgentRole } from "./ai-http";
import type { ApiSDK } from "../services/api-sdk";

// GET /api/2.0/ai/context/get-knowledge-folders and get-context-folders —
// measured on a live portal on 2026-11-05 (SDK 4.1.0).
//
// The SDK types both methods as `AiSuccessResponse` (`{ success: boolean }`),
// but the portal answers a bare JSON array. `ContextApi` is not exposed by
// `forRole`, so these routes are driven with raw requests.
//
//   get-knowledge-folders -> [{ cloud: "docspace", rooms: [{ id: "123", name }] }]
//     the KnowledgeRooms (RoomType 11) the caller can see, grouped by cloud.
//     `id` is a STRING, unlike every room id elsewhere in the API.
//   get-context-folders   -> [] in every state tried; what fills it is unknown.

export type KnowledgeFolder = { id: string; name: string };
export type KnowledgeCloud = { cloud: string; rooms: KnowledgeFolder[] };

export class AiContext extends AiHttp {
  getKnowledgeFolders(role: AgentRole) {
    return this.call<KnowledgeCloud[]>(
      role,
      "get",
      "/api/2.0/ai/context/get-knowledge-folders",
    );
  }

  /** `RoomsAIApi` is not exposed by `forRole`. 204 on success. */
  linkProjectSources(role: AgentRole, projectId: number, roomIds: number[]) {
    return this.call<unknown>(
      role,
      "post",
      `/api/2.0/files/rooms/${projectId}/sources`,
      { roomIds },
    );
  }

  getProjectSources(role: AgentRole, projectId: number) {
    return this.call<{
      response?: { knowledgeRooms?: { id: number }[] | null };
    }>(role, "get", `/api/2.0/files/rooms/${projectId}/sources`);
  }

  getContextFolders(role: AgentRole) {
    return this.call<unknown>(
      role,
      "get",
      "/api/2.0/ai/context/get-context-folders",
    );
  }
}

/** Every room of every cloud in one list, in the order the portal sent them. */
export function knowledgeRooms(data: unknown): KnowledgeFolder[] {
  expect(Array.isArray(data), "the answer is a JSON array").toBe(true);
  return (data as KnowledgeCloud[]).flatMap((cloud) => cloud.rooms);
}

export function knowledgeRoomIds(data: unknown): string[] {
  return knowledgeRooms(data).map((room) => room.id);
}

/** Creates a room of any type as the owner and insists on the 200. */
export async function createTypedRoom(
  apiSdk: ApiSDK,
  title: string,
  roomType: RoomType,
): Promise<number> {
  const { data, status } = await apiSdk.forRole("owner").rooms.createRoom({
    createRoomRequestDto: { title, roomType },
  });
  expect(status, `creating ${title} (roomType ${roomType})`).toBe(200);
  expect(data.response?.id, `${title} has an id`).toBeDefined();
  return data.response!.id!;
}

/** A room title no other room of the run shares, so a name proves identity. */
export function roomTitle(apiSdk: ApiSDK, label = "Context"): string {
  return `Autotest ${label} ${apiSdk.faker.generateString(8)}`;
}
