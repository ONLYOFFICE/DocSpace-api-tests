import { expect } from "@playwright/test";
import type { ApiSDK } from "../services/api-sdk";
import type { Role } from "../services/token-store";

// GET /api/2.0/ai/context/get-knowledge-folders and get-context-folders —
// measured on a live portal on 2026-11-05 (SDK 4.1.0), called through
// `forRole(role).aiContext`.
//
// The SDK types both methods as `AiSuccessResponse` (`{ success: boolean }`),
// but the portal answers a bare JSON array, so `data` has to be read through the
// helpers below instead of the declared type.
//
//   get-knowledge-folders -> [{ cloud: "docspace", rooms: [{ id: "123", name }] }]
//     the KnowledgeRooms (RoomType 11) the caller can see, grouped by cloud.
//     `id` is a STRING, unlike every room id elsewhere in the API.
//   get-context-folders   -> [] in every state tried; what fills it is unknown.

export type KnowledgeFolder = { id: string; name: string };
export type KnowledgeCloud = { cloud: string; rooms: KnowledgeFolder[] };

/** The answer as the array the portal really sends, not the SDK's type. */
export function knowledgeClouds(data: unknown): KnowledgeCloud[] {
  expect(Array.isArray(data), "the answer is a JSON array").toBe(true);
  return data as KnowledgeCloud[];
}

/** Every room of every cloud in one list, in the order the portal sent them. */
export function knowledgeRooms(data: unknown): KnowledgeFolder[] {
  return knowledgeClouds(data).flatMap((cloud) => cloud.rooms);
}

export function knowledgeRoomIds(data: unknown): string[] {
  return knowledgeRooms(data).map((room) => room.id);
}

/** A room title no other room of the run shares, so a name proves identity. */
export function roomTitle(apiSdk: ApiSDK, label = "Context"): string {
  return `Autotest ${label} ${apiSdk.faker.generateString(8)}`;
}

/**
 * The shared request context's session cookie beats the bearer token, so a
 * "member reads" call may really be the owner reading. Pin who is acting before
 * any conclusion that depends on it.
 */
export async function expectActingAs(
  apiSdk: ApiSDK,
  role: Role,
  userId: string,
  label: string = role,
) {
  const { status, data } = await apiSdk.forRole(role).profiles.getSelfProfile();
  expect(status, `GET /people/@self as ${label}`).toBe(200);
  expect(data.response?.id, `the request context is acting as ${label}`).toBe(
    userId,
  );
}
