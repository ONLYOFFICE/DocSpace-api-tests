import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  createAgentWithKnowledgeFolder,
  createKnowledgeFile,
} from "@/src/helpers/ai-vectorization";
import { FileShare } from "@onlyoffice/docspace-api-sdk";

const ROLES = ["DocSpaceAdmin", "RoomAdmin", "User", "Guest"] as const;

test.describe("Vectorization - startTask permissions", () => {
  test("POST /api/2.0/ai/vectorization/tasks - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    // AI is enabled first so the 401 cannot come from a disabled-AI 403 instead.
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const anonApi = apiSdk.forAnonymous();

    // File id 1 need not exist: authentication must be rejected before the
    // endpoint looks the file up.
    const { status } = await anonApi.vectorization.startTask({
      vectorizationStartRequestBody: {
        files: new Set([1]),
      },
    });

    expect(status).toBe(401);
  });

  // The member gets the id of a REAL file the owner created in the agent's
  // Knowledge folder, so a rejection can only be about the caller's rights —
  // passing a folder id here would let the endpoint fail on the input instead.
  for (const role of ROLES) {
    test.fail(
      `BUG 80736: POST /api/2.0/ai/vectorization/tasks - ${role} with Viewer role cannot start vectorization task`,
      async ({ apiSdk, paymentsApi }) => {
        const ownerApi = apiSdk.forRole("owner");

        await enableAiGateway(paymentsApi, ownerApi.payment);

        const { agentId, knowledgeFolderId } =
          await createAgentWithKnowledgeFolder(apiSdk);

        const fileId = await createKnowledgeFile(
          ownerApi,
          knowledgeFolderId,
          `Autotest Vectorization Viewer ${role}.docx`,
        );

        const { data: memberData, userData } = await apiSdk.addMember(
          "owner",
          role,
        );

        await ownerApi.rooms.setRoomSecurity({
          id: agentId,
          roomInvitationRequest: {
            invitations: [
              { id: memberData.response!.id!, access: FileShare.Read },
            ],
            notify: false,
          },
        });

        const memberApi = await apiSdk.authenticateMember(userData, role);

        const { status } = await memberApi.vectorization.startTask({
          vectorizationStartRequestBody: {
            files: new Set([fileId]),
          },
        });

        expect(status).toBe(403);
      },
    );
  }

  for (const role of ROLES) {
    test.fail(
      `BUG 80736: POST /api/2.0/ai/vectorization/tasks - ${role} not added to agent cannot start vectorization task`,
      async ({ apiSdk, paymentsApi }) => {
        const ownerApi = apiSdk.forRole("owner");

        await enableAiGateway(paymentsApi, ownerApi.payment);

        const { knowledgeFolderId } =
          await createAgentWithKnowledgeFolder(apiSdk);

        const fileId = await createKnowledgeFile(
          ownerApi,
          knowledgeFolderId,
          `Autotest Vectorization Outsider ${role}.docx`,
        );

        const { api: memberApi } = await apiSdk.addAuthenticatedMember(
          "owner",
          role,
        );

        const { status } = await memberApi.vectorization.startTask({
          vectorizationStartRequestBody: {
            files: new Set([fileId]),
          },
        });

        expect(status).toBe(403);
      },
    );
  }
});
// TODO: Expand the list of user role tests in the agent after fixing the bug
