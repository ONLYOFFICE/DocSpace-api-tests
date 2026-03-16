import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { aiProviders } from "@/src/helpers/ai-providers";

test.describe("POST /ai/agents - User cannot create AI agent", () => {
  for (const [key, provider] of Object.entries(aiProviders)) {
    test(`POST /ai/agents - User cannot create an agent with ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: provider.type,
        title: provider.title,
        key: provider.key,
      });
      const providerId = providerData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "User");
      const userApi = apiSdk.forRole("user");

      const { data, status } = await userApi.agents.createAgent({
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

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe(
        "You don't have enough permission to create",
      );
    });
  }
});

test.describe("POST /ai/agents - Guest cannot create AI agent", () => {
  for (const [key, provider] of Object.entries(aiProviders)) {
    test(`POST /ai/agents - Guest cannot create an agent with ${provider.title} provider`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: provider.type,
        title: provider.title,
        key: provider.key,
      });
      const providerId = providerData.response!.id!;

      await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestApi = apiSdk.forRole("guest");

      const { data, status } = await guestApi.agents.createAgent({
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

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
      expect((data as any).error.message).toBe(
        "You don't have enough permission to create",
      );
    });
  }
});

test.describe("POST /ai/agents - Anonymous cannot create AI agent", () => {
  test("POST /ai/agents - Anonymous cannot create an agent without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.agents.createAgent({
      title: "Autotest Unauthorized Agent",
      color: "FF5733",
      cover: "layers",
      tags: ["autotest"],
      chatSettings: {
        providerId: 1,
        modelId: aiProviders.openAi.modelId,
        prompt: "You are a test assistant",
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /ai/agents - Get AI agents access control", () => {
  test.fail(
    "BUG 80658: GET /ai/agents - Room Admin cannot see agents created by Owner",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: aiProviders.openAi.type,
        title: aiProviders.openAi.title,
        key: aiProviders.openAi.key,
      });
      const providerId = providerData.response!.id!;

      await ownerApi.agents.createAgent({
        title: "Autotest Hidden Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: aiProviders.openAi.modelId,
          prompt: "You are a test assistant",
        },
      });

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminApi = apiSdk.forRole("roomAdmin");

      const { status } = await roomAdminApi.agents.getAgents();

      expect(status).toBe(403);
    },
  );

  test.fail(
    "BUG 80658: GET /ai/agents - User cannot see agents created by Owner",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: aiProviders.openAi.type,
        title: aiProviders.openAi.title,
        key: aiProviders.openAi.key,
      });
      const providerId = providerData.response!.id!;

      await ownerApi.agents.createAgent({
        title: "Autotest Hidden Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: aiProviders.openAi.modelId,
          prompt: "You are a test assistant",
        },
      });

      await apiSdk.addAuthenticatedMember("owner", "User");
      const userApi = apiSdk.forRole("user");

      const { status } = await userApi.agents.getAgents();

      expect(status).toBe(403);
    },
  );

  test.fail(
    "BUG 80658: GET /ai/agents - Guest cannot see agents created by Owner",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: providerData } = await ownerApi.providers.addProvider({
        type: aiProviders.openAi.type,
        title: aiProviders.openAi.title,
        key: aiProviders.openAi.key,
      });
      const providerId = providerData.response!.id!;

      await ownerApi.agents.createAgent({
        title: "Autotest Hidden Agent",
        color: "FF5733",
        cover: "layers",
        tags: ["autotest"],
        chatSettings: {
          providerId,
          modelId: aiProviders.openAi.modelId,
          prompt: "You are a test assistant",
        },
      });

      await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestApi = apiSdk.forRole("guest");

      const { status } = await guestApi.agents.getAgents();

      expect(status).toBe(403);
    },
  );

  test("GET /ai/agents - Anonymous cannot get agents without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.agents.getAgents();

    expect(status).toBe(401);
  });
});

test.describe("GET /ai/agents/:id - Get AI agent info access control", () => {
  test("GET /ai/agents/:id - Room Admin cannot get agent info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Hidden Agent",
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

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data, status } = await roomAdminApi.agents.getAgentInfo(agentId);

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to view the folder content",
    );
  });

  test("GET /ai/agents/:id - User cannot get agent info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Hidden Agent",
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

    await apiSdk.addAuthenticatedMember("owner", "User");
    const userApi = apiSdk.forRole("user");

    const { data, status } = await userApi.agents.getAgentInfo(agentId);

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to view the folder content",
    );
  });

  test("GET /ai/agents/:id - Guest cannot get agent info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Hidden Agent",
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

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data, status } = await guestApi.agents.getAgentInfo(agentId);

    expect(status).toBe(403);
    expect((data as any).error.message).toBe(
      "You don't have enough permission to view the folder content",
    );
  });

  test("GET /ai/agents/:id - Anonymous cannot get agent info without authorization", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: providerData } = await ownerApi.providers.addProvider({
      type: aiProviders.openAi.type,
      title: aiProviders.openAi.title,
      key: aiProviders.openAi.key,
    });
    const providerId = providerData.response!.id!;

    const { data: agentData } = await ownerApi.agents.createAgent({
      title: "Autotest Hidden Agent",
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

    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.agents.getAgentInfo(agentId);

    expect(status).toBe(401);
  });
});

test.describe("DELETE /ai/agents/:id - Delete AI agent access control", () => {
  test.fail(
    "BUG 80654: DELETE /ai/agents/:id - User cannot delete an agent",
    async ({ apiSdk }) => {
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

      await apiSdk.addAuthenticatedMember("owner", "User");
      const userApi = apiSdk.forRole("user");

      const { data, status } = await userApi.agents.deleteAgent(agentId, {
        deleteAfter: false,
      });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
    },
  );

  test.fail(
    "BUG 80654: DELETE /ai/agents/:id - Guest cannot delete an agent",
    async ({ apiSdk }) => {
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

      await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestApi = apiSdk.forRole("guest");

      const { data, status } = await guestApi.agents.deleteAgent(agentId, {
        deleteAfter: false,
      });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
    },
  );

  test("DELETE /ai/agents/:id - Anonymous cannot delete an agent without authorization", async ({
    apiSdk,
  }) => {
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

    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.agents.deleteAgent(agentId, {
      deleteAfter: false,
    });

    expect(status).toBe(401);
  });

  test.fail(
    "BUG 80654: DELETE /ai/agents/:id - DocSpace Admin cannot delete an agent created by Owner",
    async ({ apiSdk }) => {
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

      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminApi = apiSdk.forRole("docSpaceAdmin");

      const { data, status } = await adminApi.agents.deleteAgent(agentId, {
        deleteAfter: false,
      });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
    },
  );

  test.fail(
    "BUG 80654: DELETE /ai/agents/:id - Room Admin cannot delete an agent created by Owner",
    async ({ apiSdk }) => {
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

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
      const roomAdminApi = apiSdk.forRole("roomAdmin");

      const { data, status } = await roomAdminApi.agents.deleteAgent(agentId, {
        deleteAfter: false,
      });

      expect(status).toBe(403);
      expect(data.statusCode).toBe(403);
    },
  );
});
