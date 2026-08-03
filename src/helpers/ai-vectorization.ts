import { expect } from "@playwright/test";
import { FolderType, VectorizationStatus } from "@onlyoffice/docspace-api-sdk";
import { ApiSDK } from "../services/api-sdk";
import { Role } from "../services/token-store";
import { AiAgentChat } from "./ai-agent-chat";

// Shared setup for POST /api/2.0/ai/vectorization/tasks.
//
// What the portal actually exposes (measured on a live portal):
//   * `vectorizationStatus` exists ONLY on files stored in an agent's Knowledge
//     folder. Files in My Documents or in a regular room never get the field,
//     and starting a task on them leaves it undefined forever.
//   * DocSpace auto-vectorizes every file added to a Knowledge folder:
//     the create/upload response already carries InProgress (0) and it flips to
//     Completed (1) about a second later, with no startTask call at all.
//   * There is no read route for tasks — GET /ai/vectorization/tasks is 404 —
//     so an explicit startTask on an already-vectorized file produces no
//     observable transition. `vectorizationStatus` is therefore the strongest
//     available proof that the submitted file really is indexed for AI search;
//     it cannot attribute the indexing to one specific startTask call.

type RoleApi = ReturnType<ApiSDK["forRole"]>;

export type AgentKnowledge = {
  agentId: number;
  knowledgeFolderId: number;
};

/** Creates an agent on the gateway profile and resolves its Knowledge folder. */
export async function createAgentWithKnowledgeFolder(
  apiSdk: ApiSDK,
  role: Role = "owner",
  title = "Autotest Vectorization Agent",
): Promise<AgentKnowledge> {
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profileId = await aiChat.defaultProfileId(role);
  const agentId = await aiChat.createAgentId(role, {
    title,
    tags: ["autotest", "vectorization"],
    profileId,
  });

  const { data, status } = await apiSdk.forRole(role).folders.getFolders({
    folderId: agentId,
  });

  if (status !== 200) {
    throw new Error(
      `getFolders failed for agent ${agentId}: ${status} ${JSON.stringify(data)}`,
    );
  }

  const folders = (data.response ?? []) as Array<{
    id?: number;
    type?: number;
  }>;
  const knowledgeFolderId = folders.find(
    (folder) => folder.type === FolderType.Knowledge,
  )?.id;

  if (knowledgeFolderId === undefined) {
    throw new Error(
      `Agent ${agentId} has no Knowledge folder: ${JSON.stringify(folders)}`,
    );
  }

  return { agentId, knowledgeFolderId };
}

/** Creates a real .docx inside the agent's Knowledge folder. */
export async function createKnowledgeFile(
  api: RoleApi,
  knowledgeFolderId: number,
  title: string,
): Promise<number> {
  const { data, status } = await api.files.createFile({
    folderId: knowledgeFolderId,
    createFileJsonElement: { title },
  });
  const fileId = data.response?.id;

  if (status !== 200 || !fileId) {
    throw new Error(`createFile failed: ${status} ${JSON.stringify(data)}`);
  }

  return fileId;
}

/**
 * Polls the file until its vectorization reaches a terminal state and returns
 * it. A missing `vectorizationStatus` keeps the wait going — the field may not
 * have been written yet — so the caller can trust the returned value.
 *
 * Throws on timeout and on a non-200 read (a deleted file or a caller who lost
 * access is a broken precondition, not a state worth waiting for). Which
 * terminal state is expected stays with the caller: assert Completed or Failed
 * in the test, not here.
 */
export async function waitForVectorization(
  api: RoleApi,
  fileId: number,
  timeoutMs = 30000,
): Promise<VectorizationStatus> {
  let last: VectorizationStatus | undefined;

  await expect(async () => {
    const { data, status } = await api.files.getFileInfo({ fileId });
    expect(status, `getFileInfo(${fileId}) ${JSON.stringify(data)}`).toBe(200);

    last = (data.response as { vectorizationStatus?: VectorizationStatus })
      ?.vectorizationStatus;
    expect(
      last,
      `file ${fileId} has no terminal vectorizationStatus yet`,
    ).not.toBe(VectorizationStatus.InProgress);
    expect(last, `file ${fileId} has no vectorizationStatus`).toBeDefined();
  }).toPass({
    intervals: [500, 1_000, 2_000],
    timeout: timeoutMs,
  });

  return last!;
}
