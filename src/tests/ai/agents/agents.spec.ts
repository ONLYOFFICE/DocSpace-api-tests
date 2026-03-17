import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";
import { aiProviders } from "@/src/helpers/ai-providers";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

test.describe("POST /ai/agents - Create AI agent", () => {
  for (const [key, provider] of Object.entries(aiProviders)) {
    test(`POST /ai/agents - Owner creates an agent with ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: provider.type,
        title: provider.title,
        key: provider.key,
      });
      const providerId = providerData.response!.id!;

      const { data, status } = await ownerApi.agents.createAgent({
        title: `Autotest ${provider.title} Agent`,
        color: "FF5733",
        cover: "layers",
        tags: ["autotest", key],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: `You are a test assistant powered by ${provider.title}`,
        },
      });

      expect(status).toBe(200);
      expect(data.response?.title).toBe(`Autotest ${provider.title} Agent`);
      expect(data.response?.roomType).toBe(RoomType.AiRoom);
      expect(data.response?.chatSettings?.modelId).toBe(provider.modelId);
      expect(data.response?.chatSettings?.prompt).toBe(
        `You are a test assistant powered by ${provider.title}`,
      );
    });
  }
});

test.describe("POST /ai/agents - DocSpace Admin creates AI agent", () => {
  for (const [key, provider] of Object.entries(aiProviders)) {
    test(`POST /ai/agents - DocSpace Admin creates an agent with ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminApi = apiSdk.forRole("docSpaceAdmin");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: provider.type,
        title: provider.title,
        key: provider.key,
      });
      const providerId = providerData.response!.id!;

      const { data, status } = await adminApi.agents.createAgent({
        title: `Autotest ${provider.title} Agent`,
        color: "FF5733",
        cover: "layers",
        tags: ["autotest", key],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: `You are a test assistant powered by ${provider.title}`,
        },
      });

      expect(status).toBe(200);
      expect(data.response?.title).toBe(`Autotest ${provider.title} Agent`);
      expect(data.response?.roomType).toBe(RoomType.AiRoom);
      expect(data.response?.chatSettings?.modelId).toBe(provider.modelId);
      expect(data.response?.chatSettings?.prompt).toBe(
        `You are a test assistant powered by ${provider.title}`,
      );
    });
  }
});

test.describe("POST /ai/agents - Room Admin creates AI agent", () => {
  for (const [key, provider] of Object.entries(aiProviders)) {
    test(`POST /ai/agents - Room Admin creates an agent with ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: provider.type,
        title: provider.title,
        key: provider.key,
      });
      const providerId = providerData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminApi = apiSdk.forRole("roomAdmin");

      const { data, status } = await roomAdminApi.agents.createAgent({
        title: `Autotest ${provider.title} Agent`,
        color: "FF5733",
        cover: "layers",
        tags: ["autotest", key],
        chatSettings: {
          providerId,
          modelId: provider.modelId,
          prompt: `You are a test assistant powered by ${provider.title}`,
        },
      });

      expect(status).toBe(200);
      expect(data.response?.title).toBe(`Autotest ${provider.title} Agent`);
      expect(data.response?.roomType).toBe(RoomType.AiRoom);
      expect(data.response?.chatSettings?.modelId).toBe(provider.modelId);
      expect(data.response?.chatSettings?.prompt).toBe(
        `You are a test assistant powered by ${provider.title}`,
      );
    });
  }
});

test.describe("POST /ai/agents - Create AI agent with invalid modelId", () => {
  test.fail(
    "BUG 80650: POST /ai/agents - Missing validation for modelId parameter",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: aiProviders.openAi.type,
        title: aiProviders.openAi.title,
        key: aiProviders.openAi.key,
      });
      const providerId = providerData.response!.id!;

      const { status } = await ownerApi.agents.createAgent({
        title: "Autotest Invalid Model Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: "invalid-nonexistent-model-123",
          prompt: "You are a test assistant",
        },
      });
      // Change expect after bug fix
      expect(status).not.toBe(200);
    },
  );

  test("POST /ai/agents - Owner cannot create an agent with empty modelId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data, status } = await ownerApi.agents.createAgent({
      title: "Autotest Empty Model Agent",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: "",
        prompt: "You are a test assistant",
      },
    });

    expect(status).toBe(403);
    expect(data.statusCode).toBe(403);
  });
});

test.describe("GET /ai/agents - Get AI agents", () => {
  test("GET /ai/agents - Owner creates an agent and verifies it in agent list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Get Agents",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
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
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.id).toBe(agentId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents - DocSpace Admin sees an agent created by Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Get Agents Admin",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
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
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.id).toBe(agentId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });
});

test.describe("GET /ai/agents - Users can see agent", () => {
  test("GET /ai/agents - Room Admin added to agent room sees the agent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Room Member",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(agentId, {
      invitations: [{ id: memberId, access: FileShare.Read }],
      notify: false,
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
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents - User added to agent room sees the agent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Room Member",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(agentId, {
      invitations: [{ id: memberId, access: FileShare.Read }],
      notify: false,
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
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents - Guest added to agent room sees the agent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Room Member",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(agentId, {
      invitations: [{ id: memberId, access: FileShare.Read }],
      notify: false,
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
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });
});

test.describe("GET /ai/agents/:id - Get AI agent info", () => {
  test("GET /ai/agents/:id - Owner creates an agent and gets its info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Get Agent Info",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await ownerApi.agents.getAgentInfo(agentId);

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents/:id - DocSpace Admin gets info about agent created by Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Get Agent Info Admin",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data, status } = await adminApi.agents.getAgentInfo(agentId);

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });
});

test.describe("GET /ai/agents/:id - Users can get agent info", () => {
  test("GET /ai/agents/:id - Room Admin added to agent room gets agent info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Get Agent Info Room Member",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(agentId, {
      invitations: [{ id: memberId, access: FileShare.Read }],
      notify: false,
    });

    const roomAdminApi = await apiSdk.authenticateMember(userData, "RoomAdmin");

    const { data, status } = await roomAdminApi.agents.getAgentInfo(agentId);

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents/:id - User added to agent room gets agent info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Get Agent Info Room Member",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(agentId, {
      invitations: [{ id: memberId, access: FileShare.Read }],
      notify: false,
    });

    const userApi = await apiSdk.authenticateMember(userData, "User");

    const { data, status } = await userApi.agents.getAgentInfo(agentId);

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });

  test("GET /ai/agents/:id - Guest added to agent room gets agent info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;
    const ownerDisplayName = ownerProfile.response!.displayName!;

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Get Agent Info Room Member",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const memberId = memberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(agentId, {
      invitations: [{ id: memberId, access: FileShare.Read }],
      notify: false,
    });

    const guestApi = await apiSdk.authenticateMember(userData, "Guest");

    const { data, status } = await guestApi.agents.getAgentInfo(agentId);

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const agent = data.response as any;
    expect(agent).toBeDefined();
    expect(agent.id).toBe(agentId);
    expect(agent.logo.color).toBe("FF5733");
    expect(agent.logo.cover.id).toBe("layers");
    expect(agent.chatSettings.modelId).toBe(aiProviders.openAi.modelId);
    expect(agent.createdBy.id).toBe(ownerId);
    expect(agent.createdBy.displayName).toBe(ownerDisplayName);
  });
});

test.describe("DELETE /ai/agents/:id - Delete AI agent", () => {
  test("DELETE /ai/agents/:id - Owner deletes an agent", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent to Delete",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await ownerApi.agents.deleteAgent(agentId, {
      deleteAfter: false,
    });
    const operation = await waitForOperation(ownerApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("DELETE /ai/agents/:id - DocSpace Admin deletes an agent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await adminApi.agents.createAgent({
      title: "Autotest Agent to Delete",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await adminApi.agents.deleteAgent(agentId, {
      deleteAfter: false,
    });
    const operation = await waitForOperation(adminApi.operations);

    expect(status).toBe(200);
    expect(operation.finished).toBe(true);
    expect(operation.error).toBe("");
  });

  test("DELETE /ai/agents/:id - Room Admin deletes an agent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: agentData } = await roomAdminApi.agents.createAgent({
      title: "Autotest Agent to Delete",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { status } = await roomAdminApi.agents.deleteAgent(agentId, {
      deleteAfter: false,
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
    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent News",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    // Add all users to the agent room
    await ownerApi.rooms.setRoomSecurity(agentId, {
      invitations: [
        { id: adminMemberId, access: FileShare.Read },
        { id: roomAdminMemberId, access: FileShare.Read },
        { id: userMemberId, access: FileShare.Read },
        { id: guestMemberId, access: FileShare.Read },
      ],
      notify: false,
    });

    // Step 3: Find Result Storage folder (type 33) via GET /api/2.0/files/{parentId}
    const agentParentId = (agentData.response as any).parentId;
    const { data: parentContent } =
      await ownerApi.folders.getFolderByFolderId(agentParentId);
    const folders = (parentContent as any).response?.folders ?? [];
    const resultStorageFolder = (folders as any[]).find(
      (f: any) => f.type === 33 && f.parentId === agentId,
    );
    expect(resultStorageFolder).toBeDefined();
    const resultStorageFolderId = resultStorageFolder.id;

    const { status: uploadStatus } = await ownerApi.files.createTextFile(
      resultStorageFolderId,
      { title: "autotest-news.txt", content: "autotest file content" },
    );
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
    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Empty News",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    // Add all users to the agent room
    await ownerApi.rooms.setRoomSecurity(agentId, {
      invitations: [
        { id: adminMemberId, access: FileShare.Read },
        { id: roomAdminMemberId, access: FileShare.Read },
        { id: userMemberId, access: FileShare.Read },
        { id: guestMemberId, access: FileShare.Read },
      ],
      notify: false,
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
      enableQuota: true,
      defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
    });

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Quota",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await ownerApi.agents.updateAgentsQuota({
      roomIds: [agentId] as any,
      quota: QUOTA_MINIMAL_BYTES,
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
      enableQuota: true,
      defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
    });

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agent1Data } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Quota 1",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agent1Id = agent1Data.response!.id!;

    const { data: agent2Data } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Quota 2",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agent2Id = agent2Data.response!.id!;

    const { data, status } = await ownerApi.agents.updateAgentsQuota({
      roomIds: [agent1Id, agent2Id] as any,
      quota: QUOTA_MINIMAL_BYTES,
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
      enableQuota: true,
      defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
    });

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: agentData } = await adminApi.agents.createAgent({
      title: "Autotest Admin Agent Quota",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await adminApi.agents.updateAgentsQuota({
      roomIds: [agentId] as any,
      quota: QUOTA_MINIMAL_BYTES,
    });
    console.log(data);
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect((data.response as any)[0].isCustomQuota).toBe(true);
  });

  test.fail(
    "BUG 80674: PUT /ai/agents/agentquota - Room Admin changes own agent quota limit",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      });

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: aiProviders.openAi.type,
        title: aiProviders.openAi.title,
        key: aiProviders.openAi.key,
      });
      const providerId = providerData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminApi = apiSdk.forRole("roomAdmin");

      const { data: agentData } = await roomAdminApi.agents.createAgent({
        title: "Autotest RoomAdmin Agent Quota",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: aiProviders.openAi.modelId,
          prompt: "You are a test assistant",
        },
      });
      const agentId = agentData.response!.id!;

      const { data, status } = await roomAdminApi.agents.updateAgentsQuota({
        roomIds: [agentId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      });
      console.log(data);
      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect((data.response as any)[0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
      expect((data.response as any)[0].isCustomQuota).toBe(true);
    },
  );
});

test.describe("PUT /ai/agents/resetagentquota - Reset AI agent quota", () => {
  test("PUT /ai/agents/resetagentquota - Owner resets agent quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
      enableQuota: true,
      defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
    });

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Reset Quota",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    await ownerApi.agents.updateAgentsQuota({
      roomIds: [agentId] as any,
      quota: QUOTA_MINIMAL_BYTES,
    });

    const { data, status } = await ownerApi.agents.resetAgentsQuota({
      roomIds: [agentId] as any,
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
      enableQuota: true,
      defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
    });

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agent1Data } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Reset Quota 1",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agent1Id = agent1Data.response!.id!;

    const { data: agent2Data } = await ownerApi.agents.createAgent({
      title: "Autotest Agent Reset Quota 2",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agent2Id = agent2Data.response!.id!;

    await ownerApi.agents.updateAgentsQuota({
      roomIds: [agent1Id, agent2Id] as any,
      quota: QUOTA_MINIMAL_BYTES,
    });

    const { data, status } = await ownerApi.agents.resetAgentsQuota({
      roomIds: [agent1Id, agent2Id] as any,
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
      enableQuota: true,
      defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
    });

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: agentData } = await adminApi.agents.createAgent({
      title: "Autotest Admin Agent Reset Quota",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });
    const agentId = agentData.response!.id!;

    await adminApi.agents.updateAgentsQuota({
      roomIds: [agentId] as any,
      quota: QUOTA_MINIMAL_BYTES,
    });

    const { data, status } = await adminApi.agents.resetAgentsQuota({
      roomIds: [agentId] as any,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect((data.response as any)[0].quotaLimit).toBe(
      DEFAULT_QUOTA_AGENT_BYTES,
    );
    expect((data.response as any)[0].isCustomQuota).toBe(false);
  });

  test.fail(
    "BUG 80674: PUT /ai/agents/resetagentquota - Room Admin resets own agent quota limit",
    async ({ apiSdk, paymentsApi }) => {
      await paymentsApi.setupPayment();
      const ownerApi = apiSdk.forRole("owner");
      await ownerApi.settingsQuota.saveAiAgentQuotaSettings({
        enableQuota: true,
        defaultQuota: DEFAULT_QUOTA_AGENT_BYTES,
      });

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: aiProviders.openAi.type,
        title: aiProviders.openAi.title,
        key: aiProviders.openAi.key,
      });
      const providerId = providerData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminApi = apiSdk.forRole("roomAdmin");

      const { data: agentData } = await roomAdminApi.agents.createAgent({
        title: "Autotest RoomAdmin Agent Reset Quota",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: aiProviders.openAi.modelId,
          prompt: "You are a test assistant",
        },
      });
      const agentId = agentData.response!.id!;

      await roomAdminApi.agents.updateAgentsQuota({
        roomIds: [agentId] as any,
        quota: QUOTA_MINIMAL_BYTES,
      });

      const { data, status } = await roomAdminApi.agents.resetAgentsQuota({
        roomIds: [agentId] as any,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect((data.response as any)[0].quotaLimit).toBe(
        DEFAULT_QUOTA_AGENT_BYTES,
      );
      expect((data.response as any)[0].isCustomQuota).toBe(false);
    },
  );
});

test.describe("PUT /ai/agents/:id - Update AI agent", () => {
  test("PUT /ai/agents/:id - Owner updates agent name, tag, provider and prompt", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: provider1Data } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const provider1Id = provider1Data.response!.id!;

    const { data: provider2Data } = await ownerApi.providers.addProvider({
      type: aiProviders.anthropic.type,
      title: aiProviders.anthropic.title,
      key: aiProviders.anthropic.key,
    });
    const provider2Id = provider2Data.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Original Agent",
      tags: ["original-tag"],
      chatSettings: {
        providerId: provider1Id,
        modelId: aiProviders.openAi.modelId,
        prompt: "Original prompt",
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await ownerApi.agents.updateAgent(agentId, {
      title: "Updated Agent",
      tags: ["updated-tag"],
      chatSettings: {
        providerId: provider2Id,
        modelId: aiProviders.anthropic.modelId,
        prompt: "Updated prompt",
      },
    });
    console.log(data);
    expect(status).toBe(200);
    expect(data.response?.title).toBe("Updated Agent");
    expect(data.response?.tags).toContain("updated-tag");
    expect(data.response?.tags).not.toContain("original-tag");
    expect(data.response?.chatSettings?.modelId).toBe(
      aiProviders.anthropic.modelId,
    );
    expect(data.response?.chatSettings?.prompt).toBe("Updated prompt");
  });

  test("PUT /ai/agents/:id - DocSpace Admin updates agent name, tag, provider and prompt", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: provider1Data } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const provider1Id = provider1Data.response!.id!;

    const { data: provider2Data } = await ownerApi.providers.addProvider({
      type: aiProviders.anthropic.type,
      title: aiProviders.anthropic.title,
      key: aiProviders.anthropic.key,
    });
    const provider2Id = provider2Data.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: agentData } = await adminApi.agents.createAgent({
      title: "Original Agent",
      tags: ["original-tag"],
      chatSettings: {
        providerId: provider1Id,
        modelId: aiProviders.openAi.modelId,
        prompt: "Original prompt",
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await adminApi.agents.updateAgent(agentId, {
      title: "Updated Agent",
      tags: ["updated-tag"],
      chatSettings: {
        providerId: provider2Id,
        modelId: aiProviders.anthropic.modelId,
        prompt: "Updated prompt",
      },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Updated Agent");
    expect(data.response?.tags).toContain("updated-tag");
    expect(data.response?.tags).not.toContain("original-tag");
    expect(data.response?.chatSettings?.modelId).toBe(
      aiProviders.anthropic.modelId,
    );
    expect(data.response?.chatSettings?.prompt).toBe("Updated prompt");
  });

  test("PUT /ai/agents/:id - Room Admin updates agent name, tag, provider and prompt", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: provider1Data } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const provider1Id = provider1Data.response!.id!;

    const { data: provider2Data } = await ownerApi.providers.addProvider({
      type: aiProviders.anthropic.type,
      title: aiProviders.anthropic.title,
      key: aiProviders.anthropic.key,
    });
    const provider2Id = provider2Data.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: agentData } = await roomAdminApi.agents.createAgent({
      title: "Original Agent",
      tags: ["original-tag"],
      chatSettings: {
        providerId: provider1Id,
        modelId: aiProviders.openAi.modelId,
        prompt: "Original prompt",
      },
    });
    const agentId = agentData.response!.id!;

    const { data, status } = await roomAdminApi.agents.updateAgent(agentId, {
      title: "Updated Agent",
      tags: ["updated-tag"],
      chatSettings: {
        providerId: provider2Id,
        modelId: aiProviders.anthropic.modelId,
        prompt: "Updated prompt",
      },
    });

    expect(status).toBe(200);
    expect(data.response?.title).toBe("Updated Agent");
    expect(data.response?.tags).toContain("updated-tag");
    expect(data.response?.tags).not.toContain("original-tag");
    expect(data.response?.chatSettings?.modelId).toBe(
      aiProviders.anthropic.modelId,
    );
    expect(data.response?.chatSettings?.prompt).toBe("Updated prompt");
  });
});
