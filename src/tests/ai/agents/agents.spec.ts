import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";
import { onlyofficeAiProvider } from "@/src/helpers/ai-providers";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { parseSseEvents } from "@/src/helpers/parse-sse-events";

test.describe("POST /ai/agents - Create AI agent", () => {
  test("POST /ai/agents - Owner creates an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data, status } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(
      (data.response?.chatSettings as { modelId?: string } | undefined)
        ?.modelId,
    ).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant",
    );
  });
});

test.describe("POST /ai/agents - DocSpace Admin creates AI agent", () => {
  test("POST /ai/agents - DocSpace Admin creates an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data, status } = await adminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(
      (data.response?.chatSettings as { modelId?: string } | undefined)
        ?.modelId,
    ).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant",
    );
  });
});

test.describe("POST /ai/agents - Room Admin creates AI agent", () => {
  test("POST /ai/agents - Room Admin creates an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Autotest Agent");
    expect(data.response?.roomType).toBe(RoomType.AiRoom);
    expect(
      (data.response?.chatSettings as { modelId?: string } | undefined)
        ?.modelId,
    ).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.chatSettings?.prompt).toBe(
      "You are a test assistant",
    );
  });
});

test.describe("POST /ai/agents - Create AI agent with invalid modelId", () => {
  test("BUG 80650: POST /ai/agents - Missing validation for modelId parameter", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data, status } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Invalid Model Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: "invalid-nonexistent-model-123",
          prompt: "You are a test assistant",
        },
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe("ModelId");
  });

  test("POST /ai/agents - Owner cannot create an agent with empty modelId", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Empty Model Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: "",
          prompt: "You are a test assistant",
        },
      },
    });

    expect(data.statusCode).toBe(400);
    expect((data as any).error?.message).toBe(
      "The value cannot be an empty string. (Parameter 'chatSettings.ModelId')",
    );
  });
});

test.describe("POST /ai/agents - Create AI agent with oversized AI Instructions", () => {
  // AI Instructions (prompt) length significantly exceeding a normal prompt size.
  const OVERSIZED_PROMPT = "A".repeat(1_000_000);

  test("POST /ai/agents - Room Admin creates an agent with an oversized prompt and the agent stays usable", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    // Step 1: Room Admin creates an agent with an excessively long AI Instructions.
    // Correct behavior: either the prompt length is limited / rejected with a clear
    // error before saving, or the agent is created but stays operational.
    const { data: agentData, status: createStatus } =
      await roomAdminApi.agents.createAgent({
        createAgentRequestDto: {
          title: "Autotest Oversized Prompt Agent",
          color: "FF5733",
          cover: "layers",
          tags: ["autotest"],
          chatSettings: {
            providerId: onlyofficeAiProvider.providerId,
            modelId: onlyofficeAiProvider.defaultModel,
            prompt: OVERSIZED_PROMPT,
          },
        },
      });

    // Acceptable fix path: the oversized prompt is rejected up front with a
    // validation error and no agent is created.
    if (createStatus !== 200) {
      expect(createStatus).toBe(400);
      return;
    }

    const agentRoomId = agentData.response!.id!;

    // Step 2: Using the agent (starting a chat) must remain operational and must
    // NOT fail with an internal server error such as
    // "Out of sort memory, consider increasing server sort buffer size".
    const response = await roomAdminApi.chat.startNewChat(
      {
        roomId: agentRoomId,
        startNewChatBody: {
          message: "What is 2+2? Answer in one word.",
        },
      },
      { responseType: "stream", timeout: 30000 },
    );

    const { messageStart, messageStop, tokens } = parseSseEvents(response.data);

    expect(response.status).toBe(200);
    expect(messageStart).toBeDefined();
    expect(messageStart!.data.error).toBe("");
    expect(tokens.length).toBeGreaterThan(0);
    expect(messageStop).toBeDefined();
    expect(messageStop!.data.messageId).toBeGreaterThan(0);
  });
});

test.describe("GET /ai/agents - Get AI agents", () => {
  test("GET /ai/agents - Owner creates an agent and verifies it in agent list", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Get Agents",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await ownerApi.agents.getAgents();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = (data.response?.folders as any[])?.find(
      (f: any) => f.id === agentId,
    );
    expect(agent).toBeDefined();
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.id).toBe(agentId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents - DocSpace Admin sees an agent created by Owner", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Get Agents Admin",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data, status } = await adminApi.agents.getAgents();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = (data.response?.folders as any[])?.find(
      (f: any) => f.id === agentId,
    );
    expect(agent).toBeDefined();
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.id).toBe(agentId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });
});

test.describe("GET /ai/agents - Users can see agent", () => {
  test("GET /ai/agents - Room Admin added to agent room sees the agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Room Member",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
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
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const roomAdminApi = await apiSdk.authenticateMember(userData, "RoomAdmin");

    const { data, status } = await roomAdminApi.agents.getAgents();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = (data.response?.folders as any[])?.find(
      (f: any) => f.id === agentId,
    );
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents - User added to agent room sees the agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Room Member",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
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
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const userApi = await apiSdk.authenticateMember(userData, "User");

    const { data, status } = await userApi.agents.getAgents();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = (data.response?.folders as any[])?.find(
      (f: any) => f.id === agentId,
    );
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents - Guest added to agent room sees the agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Room Member",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
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
      "Guest",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const guestApi = await apiSdk.authenticateMember(userData, "Guest");

    const { data, status } = await guestApi.agents.getAgents();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = (data.response?.folders as any[])?.find(
      (f: any) => f.id === agentId,
    );
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });
});

test.describe("GET /ai/agents/:id - Get AI agent info", () => {
  test("GET /ai/agents/:id - Owner creates an agent and gets its info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Get Agent Info",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await ownerApi.agents.getAgentInfo({
      id: agentId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents/:id - DocSpace Admin gets info about agent created by Owner", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Get Agent Info Admin",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data, status } = await adminApi.agents.getAgentInfo({
      id: agentId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });
});

test.describe("GET /ai/agents/:id - Users can get agent info", () => {
  test("GET /ai/agents/:id - Room Admin added to agent room gets agent info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Get Agent Info Room Member",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
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
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const roomAdminApi = await apiSdk.authenticateMember(userData, "RoomAdmin");

    const { data, status } = await roomAdminApi.agents.getAgentInfo({
      id: agentId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents/:id - User added to agent room gets agent info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Get Agent Info Room Member",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
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
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const userApi = await apiSdk.authenticateMember(userData, "User");

    const { data, status } = await userApi.agents.getAgentInfo({ id: agentId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents/:id - Guest added to agent room gets agent info", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Get Agent Info Room Member",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
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
      "Guest",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.Read }],
        notify: false,
      },
    });

    const guestApi = await apiSdk.authenticateMember(userData, "Guest");

    const { data, status } = await guestApi.agents.getAgentInfo({
      id: agentId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(onlyofficeAiProvider.defaultModel);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });
});

test.describe("DELETE /ai/agents/:id - Delete AI agent", () => {
  test("DELETE /ai/agents/:id - Owner deletes an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent to Delete",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await ownerApi.agents.deleteAgent({
      id: agentId,
      deleteRoomRequest: {
        deleteAfter: false,
      },
    });
    const operation = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("DELETE /ai/agents/:id - DocSpace Admin deletes an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await adminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent to Delete",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await adminApi.agents.deleteAgent({
      id: agentId,
      deleteRoomRequest: {
        deleteAfter: false,
      },
    });
    const operation = await waitForOperation(adminApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("DELETE /ai/agents/:id - Room Admin deletes an agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: agentData } = await roomAdminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent to Delete",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await roomAdminApi.agents.deleteAgent({
      id: agentId,
      deleteRoomRequest: {
        deleteAfter: false,
      },
    });
    const operation = await waitForOperation(roomAdminApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });
});

test.describe("GET /ai/agents/news - Get AI agents new items", () => {
  test("GET /ai/agents/news - All user roles see new items in agent", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    // Step 1: Create users
    const { data: adminMemberData, userData: adminUserData } =
      await apiSdk.addMember("owner", "DocSpaceAdmin");
    const adminMemberId = adminMemberData.response!.id!;

    const { data: roomAdminMemberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminMemberId = roomAdminMemberData.response!.id!;

    const { data: userMemberData, userData: userUserData } =
      await apiSdk.addMember("owner", "User");
    const userMemberId = userMemberData.response!.id!;

    const { data: guestMemberData, userData: guestUserData } =
      await apiSdk.addMember("owner", "Guest");
    const guestMemberId = guestMemberData.response!.id!;

    // Step 2: Create AI agent
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent News",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    // Add all users to the agent room
    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [
          { id: adminMemberId, access: FileShare.Read },
          { id: roomAdminMemberId, access: FileShare.Read },
          { id: userMemberId, access: FileShare.Read },
          { id: guestMemberId, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    // Step 3: Find Result Storage folder (type 33) via GET /api/2.0/files/{parentId}
    const agentParentId = (agentData.response as any).parentId;
    const { data: parentContent } = await ownerApi.folders.getFolderByFolderId({
      folderId: agentParentId,
    });
    const folders = (parentContent as any).response?.folders ?? [];
    const resultStorageFolder = (folders as any[]).find(
      (f: any) => f.type === 33 && f.parentId === agentId,
    );
    expect(resultStorageFolder).toBeDefined();
    const resultStorageFolderId = resultStorageFolder.id;

    const { status: uploadStatus } = await ownerApi.files.createTextFile({
      folderId: resultStorageFolderId,
      createTextOrHtmlFile: {
        title: "autotest-news.txt",
        content: "autotest file content",
      },
    });
    expect(uploadStatus).toBe(200);

    await test.step("DocSpace Admin gets agents new items", async () => {
      const adminApi = await apiSdk.authenticateMember(
        adminUserData,
        "DocSpaceAdmin",
      );
      const { data, status } = await adminApi.agents.getAgentsNewItems();
      expect(status).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("Room Admin gets agents new items", async () => {
      const roomAdminApi = await apiSdk.authenticateMember(
        roomAdminUserData,
        "RoomAdmin",
      );
      const { data, status } = await roomAdminApi.agents.getAgentsNewItems();
      expect(status).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("User gets agents new items", async () => {
      const userApi = await apiSdk.authenticateMember(userUserData, "User");
      const { data, status } = await userApi.agents.getAgentsNewItems();
      expect(status).toBe(200);
      expect(data.count).toBe(1);
    });

    await test.step("Guest gets agents new items", async () => {
      const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");
      const { data, status } = await guestApi.agents.getAgentsNewItems();
      expect(status).toBe(200);
      expect(data.count).toBe(1);
    });
  });

  test("GET /ai/agents/news - All user roles see empty news when no new items", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    // Step 1: Create users
    const { data: adminMemberData, userData: adminUserData } =
      await apiSdk.addMember("owner", "DocSpaceAdmin");
    const adminMemberId = adminMemberData.response!.id!;

    const { data: roomAdminMemberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminMemberId = roomAdminMemberData.response!.id!;

    const { data: userMemberData, userData: userUserData } =
      await apiSdk.addMember("owner", "User");
    const userMemberId = userMemberData.response!.id!;

    const { data: guestMemberData, userData: guestUserData } =
      await apiSdk.addMember("owner", "Guest");
    const guestMemberId = guestMemberData.response!.id!;

    // Step 2: Create AI agent
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Empty News",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    // Add all users to the agent room
    await ownerApi.rooms.setRoomSecurity({
      id: agentId,
      roomInvitationRequest: {
        invitations: [
          { id: adminMemberId, access: FileShare.Read },
          { id: roomAdminMemberId, access: FileShare.Read },
          { id: userMemberId, access: FileShare.Read },
          { id: guestMemberId, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    // Step 3: Each user role calls getAgentsNewItems - no files uploaded
    await test.step("DocSpace Admin sees empty news", async () => {
      const adminApi = await apiSdk.authenticateMember(
        adminUserData,
        "DocSpaceAdmin",
      );
      const { data, status } = await adminApi.agents.getAgentsNewItems();
      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    await test.step("Room Admin sees empty news", async () => {
      const roomAdminApi = await apiSdk.authenticateMember(
        roomAdminUserData,
        "RoomAdmin",
      );
      const { data, status } = await roomAdminApi.agents.getAgentsNewItems();
      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    await test.step("User sees empty news", async () => {
      const userApi = await apiSdk.authenticateMember(userUserData, "User");
      const { data, status } = await userApi.agents.getAgentsNewItems();
      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });

    await test.step("Guest sees empty news", async () => {
      const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");
      const { data, status } = await guestApi.agents.getAgentsNewItems();
      expect(status).toBe(200);
      expect(data.count).toBe(0);
    });
  });
});

const QUOTA_MINIMAL_BYTES = 104857600; // 100 MB
const DEFAULT_QUOTA_AGENT_BYTES = 524288000; // 500 MB

test.describe("PUT /ai/agents/agentquota - Change AI agent quota", () => {
  test("PUT /ai/agents/agentquota - Owner changes agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      },
    });

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Quota",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await ownerApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [agentId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
  });

  test("PUT /ai/agents/agentquota - Owner changes multiple agents quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      },
    });

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agent1Data } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Quota 1",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agent1Id = agent1Data.response!.id!;

    const { data: agent2Data } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Quota 2",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agent2Id = agent2Data.response!.id!;

    const { data, status } = await ownerApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [agent1Id, agent2Id] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
    expect((data.response as any)[1].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[1].isCustomQuota).toBe(true);
  });

  test("PUT /ai/agents/agentquota - DocSpace Admin changes own agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      },
    });

    await enableAiGateway(paymentsApi, ownerApi.payment);

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: agentData } = await adminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Admin Agent Quota",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await adminApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [agentId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
  });

  test("BUG 80674: PUT /ai/agents/agentquota - Room Admin changes own agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      },
    });

    await enableAiGateway(paymentsApi, ownerApi.payment);

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: agentData } = await roomAdminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest RoomAdmin Agent Quota",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await roomAdminApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [agentId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
  });
});

test.describe("PUT /ai/agents/resetagentquota - Reset AI agent quota", () => {
  test("PUT /ai/agents/resetagentquota - Owner resets agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      },
    });

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Reset Quota",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    await ownerApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [agentId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await ownerApi.agents.resetAgentsQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [agentId] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(
      DEFAULT_QUOTA_AGENT_BYTES,
    );
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });

  test("PUT /ai/agents/resetagentquota - Owner resets multiple agents quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      },
    });

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agent1Data } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Reset Quota 1",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agent1Id = agent1Data.response!.id!;

    const { data: agent2Data } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Agent Reset Quota 2",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agent2Id = agent2Data.response!.id!;

    await ownerApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [agent1Id, agent2Id] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await ownerApi.agents.resetAgentsQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [agent1Id, agent2Id] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(
      DEFAULT_QUOTA_AGENT_BYTES,
    );
    expect((data.response as any)[0].isCustomQuota).toBe(false);
    expect((data.response as any)[1].quotaLimit).toBe(
      DEFAULT_QUOTA_AGENT_BYTES,
    );
    expect((data.response as any)[1].isCustomQuota).toBe(false);
  });

  test("PUT /ai/agents/resetagentquota - DocSpace Admin resets own agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      },
    });

    await enableAiGateway(paymentsApi, ownerApi.payment);

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: agentData } = await adminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest Admin Agent Reset Quota",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    await adminApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [agentId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await adminApi.agents.resetAgentsQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [agentId] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(
      DEFAULT_QUOTA_AGENT_BYTES,
    );
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });

  test("BUG 80674: PUT /ai/agents/resetagentquota - Room Admin resets own agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      quotaSettingsRequestsDto: {
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      },
    });

    await enableAiGateway(paymentsApi, ownerApi.payment);

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: agentData } = await roomAdminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Autotest RoomAdmin Agent Reset Quota",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "You are a test assistant",
        },
      },
    });
    const agentId = agentData.response!.id!;

    await roomAdminApi.agents.updateAgentsQuota({
      updateRoomsQuotaRequestDtoInteger: {
        roomIds: [agentId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      },
    });

    const { data, status } = await roomAdminApi.agents.resetAgentsQuota({
      updateRoomsRoomIdsRequestDtoInteger: {
        roomIds: [agentId] as any,
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(
      DEFAULT_QUOTA_AGENT_BYTES,
    );
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });
});

test.describe("PUT /ai/agents/:id - Update AI agent", () => {
  test("PUT /ai/agents/:id - Owner updates agent name, tag and prompt", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    const { data: agentData } = await ownerApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Original Agent",
        tags: ["original-tag"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "Original prompt",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await ownerApi.agents.updateAgent({
      id: agentId,
      updateRoomRequest: {
        title: "Updated Agent",
        tags: ["updated-tag"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "Updated prompt",
        },
      },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Updated Agent");
    expect(data.response?.tags).toContain("updated-tag");
    expect(data.response?.tags).not.toContain("original-tag");
    expect(
      (data.response?.chatSettings as { modelId?: string } | undefined)
        ?.modelId,
    ).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.chatSettings?.prompt).toBe("Updated prompt");
  });

  test("PUT /ai/agents/:id - DocSpace Admin updates agent name, tag and prompt", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: agentData } = await adminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Original Agent",
        tags: ["original-tag"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "Original prompt",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await adminApi.agents.updateAgent({
      id: agentId,
      updateRoomRequest: {
        title: "Updated Agent",
        tags: ["updated-tag"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "Updated prompt",
        },
      },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Updated Agent");
    expect(data.response?.tags).toContain("updated-tag");
    expect(data.response?.tags).not.toContain("original-tag");
    expect(
      (data.response?.chatSettings as { modelId?: string } | undefined)
        ?.modelId,
    ).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.chatSettings?.prompt).toBe("Updated prompt");
  });

  test("PUT /ai/agents/:id - Room Admin updates agent name, tag and prompt", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await enableAiGateway(paymentsApi, ownerApi.payment);

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: agentData } = await roomAdminApi.agents.createAgent({
      createAgentRequestDto: {
        title: "Original Agent",
        tags: ["original-tag"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "Original prompt",
        },
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await roomAdminApi.agents.updateAgent({
      id: agentId,
      updateRoomRequest: {
        title: "Updated Agent",
        tags: ["updated-tag"],
        chatSettings: {
          providerId: onlyofficeAiProvider.providerId,
          modelId: onlyofficeAiProvider.defaultModel,
          prompt: "Updated prompt",
        },
      },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Updated Agent");
    expect(data.response?.tags).toContain("updated-tag");
    expect(data.response?.tags).not.toContain("original-tag");
    expect(
      (data.response?.chatSettings as { modelId?: string } | undefined)
        ?.modelId,
    ).toBe(onlyofficeAiProvider.defaultModel);
    expect(data.response?.chatSettings?.prompt).toBe("Updated prompt");
  });
});
