import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { onlyofficeAiProvider } from "@/src/helpers/ai-providers";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { FileShare, FolderType } from "@onlyoffice/docspace-api-sdk";

test.describe("Vectorization - startTask permissions", () => {
  test("POST /api/2.0/ai/vectorization/tasks - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.vectorization.startTask({
      vectorizationStartRequestBody: {
        files: new Set([1]),
      },
    });

    expect(status).toBe(401);
  });

  for (const role of ["DocSpaceAdmin", "RoomAdmin", "User", "Guest"] as const) {
    test.fail(
      `BUG 80736: POST /api/2.0/ai/vectorization/tasks - ${role} with Viewer role cannot start vectorization task`,
      async ({ apiSdk, paymentsApi }) => {
        const ownerApi = apiSdk.forRole("owner");

        await enableAiGateway(paymentsApi, ownerApi.payment);

        const { data: agentData } = await ownerApi.agents.createAgent({
          createAgentRequestDto: {
            title: "Autotest Vectorization Agent",
            color: "FF5733",
            cover: "layers",
            tags: ["autotest", "vectorization"],
            chatSettings: {
              providerId: onlyofficeAiProvider.providerId,
              modelId: onlyofficeAiProvider.defaultModel,
              prompt: "You are a test assistant",
            },
          },
        });
        const agentId = agentData.response!.id!;

        const { data: memberData, userData } = await apiSdk.addMember(
          "owner",
          role,
        );
        const memberId = memberData.response!.id!;

        await ownerApi.rooms.setRoomSecurity({
          id: agentId,
          roomInvitationRequest: {
            invitations: [{ id: memberId, access: FileShare.Read }],
            notify: false,
          },
        });

        const memberApi = await apiSdk.authenticateMember(userData, role);

        const { data: foldersData } = await memberApi.folders.getFolders({
          folderId: agentId,
        });
        const folders = foldersData.response as any[];
        const knowledgeFolder = folders?.find(
          (f: any) => f.type === FolderType.Knowledge,
        );
        expect(knowledgeFolder).toBeDefined();

        const fileId = knowledgeFolder.id;

        const { status } = await memberApi.vectorization.startTask({
          vectorizationStartRequestBody: {
            files: new Set([fileId]),
          },
        });

        expect(status).toBe(403);
      },
    );
  }

  for (const role of ["DocSpaceAdmin", "RoomAdmin", "User", "Guest"] as const) {
    test.fail(
      `BUG 80736: POST /api/2.0/ai/vectorization/tasks - ${role} not added to agent cannot start vectorization task`,
      async ({ apiSdk, paymentsApi }) => {
        const ownerApi = apiSdk.forRole("owner");

        await enableAiGateway(paymentsApi, ownerApi.payment);

        const { data: agentData } = await ownerApi.agents.createAgent({
          createAgentRequestDto: {
            title: "Autotest Vectorization Agent",
            color: "FF5733",
            cover: "layers",
            tags: ["autotest", "vectorization"],
            chatSettings: {
              providerId: onlyofficeAiProvider.providerId,
              modelId: onlyofficeAiProvider.defaultModel,
              prompt: "You are a test assistant",
            },
          },
        });
        const agentId = agentData.response!.id!;

        const { data: foldersData } = await ownerApi.folders.getFolders({
          folderId: agentId,
        });
        const folders = foldersData.response as any[];
        const knowledgeFolder = folders?.find(
          (f: any) => f.type === FolderType.Knowledge,
        );
        expect(knowledgeFolder).toBeDefined();

        const fileId = knowledgeFolder.id;

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
