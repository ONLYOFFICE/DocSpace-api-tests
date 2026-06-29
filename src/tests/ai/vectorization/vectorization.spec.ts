import { test } from "@/src/fixtures";
import { expect } from "@playwright/test";
import { onlyofficeAiProvider } from "@/src/helpers/ai-providers";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { FileShare, FolderType } from "@onlyoffice/docspace-api-sdk";

test.describe("Vectorization - startTask", () => {
  test("POST /api/2.0/ai/vectorization/tasks - Owner starts vectorization task", async ({
    apiSdk,
    paymentsApi,
  }) => {
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

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: knowledgeFolder.id,
      createFileJsonElement: { title: "Autotest Vectorization File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.vectorization.startTask({
      vectorizationStartRequestBody: {
        files: new Set([fileId]),
      },
    });
    const response = data as any;

    expect(status).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.status).toBe(0);
    expect(response.count).toBe(0);
  });

  test("POST /api/2.0/ai/vectorization/tasks - DocSpaceAdmin with Agent Manager role starts vectorization task", async ({
    apiSdk,
    paymentsApi,
  }) => {
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

    const { data: adminMemberData, userData: adminUserData } =
      await apiSdk.addMember("owner", "DocSpaceAdmin");
    const adminMemberId = adminMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: adminMemberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const adminApi = await apiSdk.authenticateMember(
      adminUserData,
      "DocSpaceAdmin",
    );

    const { data: foldersData } = await adminApi.folders.getFolders({
      folderId: agentId,
    });
    const folders = foldersData.response as any[];
    const knowledgeFolder = folders?.find(
      (f: any) => f.type === FolderType.Knowledge,
    );
    expect(knowledgeFolder).toBeDefined();

    const { data: fileData } = await adminApi.files.createFile({
      folderId: knowledgeFolder.id,
      createFileJsonElement: { title: "Autotest Vectorization File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await adminApi.vectorization.startTask({
      vectorizationStartRequestBody: {
        files: new Set([fileId]),
      },
    });

    const response = data as any;

    expect(status).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.status).toBe(0);
    expect(response.count).toBe(0);
  });

  test("POST /api/2.0/ai/vectorization/tasks - RoomAdmin with Agent Manager role starts vectorization task", async ({
    apiSdk,
    paymentsApi,
  }) => {
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

    const { data: raMemberData, userData: raUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const raMemberId = raMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: raMemberId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const raApi = await apiSdk.authenticateMember(raUserData, "RoomAdmin");

    const { data: foldersData } = await raApi.folders.getFolders({
      folderId: agentId,
    });
    const folders = foldersData.response as any[];
    const knowledgeFolder = folders?.find(
      (f: any) => f.type === FolderType.Knowledge,
    );
    expect(knowledgeFolder).toBeDefined();

    const { data: fileData } = await raApi.files.createFile({
      folderId: knowledgeFolder.id,
      createFileJsonElement: { title: "Autotest Vectorization File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await raApi.vectorization.startTask({
      vectorizationStartRequestBody: {
        files: new Set([fileId]),
      },
    });

    const response = data as any;

    expect(status).toBe(200);
    expect(response.statusCode).toBe(200);
    expect(response.status).toBe(0);
    expect(response.count).toBe(0);
  });
});
