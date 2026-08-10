import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  createAgentWithKnowledgeFolder,
  createKnowledgeFile,
  waitForVectorization,
} from "@/src/helpers/ai-vectorization";
import { FileShare, VectorizationStatus } from "@onlyoffice/docspace-api-sdk";

// `FileShare.RoomManager` (9) is the technical value behind the manager role of
// an agent — the SDK has no separate AgentManager member.
const MANAGERS = [
  { title: "Owner", type: null },
  { title: "DocSpaceAdmin with RoomManager access", type: "DocSpaceAdmin" },
  { title: "RoomAdmin with RoomManager access", type: "RoomAdmin" },
] as const;

test.describe("Vectorization - startTask", () => {
  for (const manager of MANAGERS) {
    test(`POST /api/2.0/ai/vectorization/tasks - ${manager.title} starts vectorization task`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await enableAiGateway(paymentsApi, ownerApi.payment);

      const { agentId, knowledgeFolderId } =
        await createAgentWithKnowledgeFolder(apiSdk);

      let api = ownerApi;
      if (manager.type !== null) {
        const { data: memberData, userData } = await apiSdk.addMember(
          "owner",
          manager.type,
        );

        await ownerApi.rooms.setRoomSecurity({
          id: agentId,
          roomInvitationRequest: {
            invitations: [
              {
                id: memberData.response!.id!,
                access: FileShare.RoomManager,
              },
            ],
            notify: false,
          },
        });

        api = await apiSdk.authenticateMember(userData, manager.type);
      }

      const fileId = await createKnowledgeFile(
        api,
        knowledgeFolderId,
        `Autotest Vectorization File ${manager.type ?? "Owner"}.docx`,
      );

      const { status } = await api.vectorization.aiVectorizationStartTask({
        requestBody: {
          files: new Set([fileId]),
        },
      });

      expect(status).toBe(200);

      // The submitted file ends up indexed for AI search. DocSpace also
      // auto-vectorizes Knowledge-folder files, so this proves the end state of
      // the very file that was submitted, not that this call alone caused it —
      // the API exposes no per-task read route to prove causation.
      expect(await waitForVectorization(api, fileId)).toBe(
        VectorizationStatus.Completed,
      );
    });
  }
});
