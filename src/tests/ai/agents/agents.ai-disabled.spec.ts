import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  configureAiToolsAsUnpaid,
  enableAiGateway,
} from "@/src/helpers/wallet-services";

// With portal AI access switched off every agent route answers 403, including
// the profiles catalogue the other tests bootstrap from.
//
// Each test proves a transition, not an end state: the portal is provisioned
// with `enableAiGateway`, the endpoint answers 200 first, the switch is flipped
// and read back, and only then is the 403 asserted. A test that just asserted
// 403 after the flip would also pass on a portal where the route is refused for
// an unrelated reason — an unprovisioned gateway, a changed permission, or a
// disable call that never took effect.
//
// Two ordering details this file pins:
//   * POST /ai/agents validates the body BEFORE checking AI access, so an
//     incomplete body returns 400 rather than 403. Every payload here is the
//     same valid one the positive tests in agents.spec.ts use.
//   * the AI-access guard runs BEFORE the existence check — a nonexistent id
//     that answers 404 with AI on answers 403 with AI off (last test).
//
// The second describe covers the other off-state — an unpaid "AI Tools" wallet
// service — where the same routes are deliberately NOT gated.

const fakeAgentId = 999999999;
const VALID_QUOTA_BYTES = 1048576; // the value the positive quota tests use

type OwnerApi = Parameters<typeof setPortalAiAccess>[0];

/** Flips the portal AI switch off and proves it actually stored the value. */
async function turnAiOff(ownerApi: OwnerApi) {
  const result = await setPortalAiAccess(ownerApi, false);
  expect(result.writeStatus, "PUT /settings/ai-access {enabled:false}").toBe(
    200,
  );
  expect(result.enabled, "ai-access read back after disabling").toBe(false);
}

/** Back on, so the refused write can be checked for side effects. */
async function turnAiOn(ownerApi: OwnerApi) {
  const result = await setPortalAiAccess(ownerApi, true);
  expect(result.writeStatus, "PUT /settings/ai-access {enabled:true}").toBe(
    200,
  );
  expect(result.enabled, "ai-access read back after re-enabling").toBe(true);
}

test.describe("AI Agents - AI Disabled", () => {
  test("POST /ai/agents - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    const before = await aiChat.createAgent("owner", {
      title: "Autotest Agent Before Disable",
      tags: ["autotest"],
      profileId,
      prompt: "You are a test assistant",
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiChat.createAgent("owner", {
      title: "Autotest AI Disabled Agent",
      tags: ["autotest"],
      profileId,
      prompt: "You are a test assistant",
    });

    // Nothing must have been created behind the 403.
    await turnAiOn(ownerApi);
    const { data: list } = await aiChat.getAgents("owner");
    const titles = list?.response?.folders?.map((agent) => agent.title) ?? [];
    expect(titles).toContain("Autotest Agent Before Disable");
    expect(titles).not.toContain("Autotest AI Disabled Agent");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /ai/agents - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const before = await aiChat.getAgents("owner");
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiChat.getAgents("owner");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /ai/agents/news - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const before = await aiChat.getAgentsNewItems("owner");
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiChat.getAgentsNewItems("owner");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /ai/agents/:id - an existing agent becomes unreadable when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest AI Disabled Read Agent",
      profileId,
    });

    const before = await aiChat.getAgentInfo("owner", agentId);
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiChat.getAgentInfo("owner", agentId);

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("PUT /ai/agents/:id - an existing agent cannot be updated when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest AI Disabled Update Agent",
      tags: ["original-tag"],
      profileId,
      prompt: "Original prompt",
    });

    const before = await aiChat.updateAgent("owner", agentId, {
      title: "Autotest Agent Updated While AI Is On",
      tags: ["updated-tag"],
      profileId,
      prompt: "Updated prompt",
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiChat.updateAgent("owner", agentId, {
      title: "Autotest Agent Updated While AI Is Off",
      tags: ["disabled-tag"],
      profileId,
      prompt: "Prompt written while AI is off",
    });

    // The refused update must not have landed.
    await turnAiOn(ownerApi);
    const { data: after } = await aiChat.getAgentInfo("owner", agentId);
    expect(after?.response?.title).toBe(
      "Autotest Agent Updated While AI Is On",
    );
    expect(after?.response?.chatSettings?.prompt).toBe("Updated prompt");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("DELETE /ai/agents/:id - an existing agent cannot be deleted when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const throwawayId = await aiChat.createAgentId("owner", {
      title: "Autotest AI Disabled Delete Baseline",
      profileId,
    });
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest AI Disabled Delete Agent",
      profileId,
    });

    const before = await aiChat.deleteAgent("owner", throwawayId);
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiChat.deleteAgent("owner", agentId);

    // A surviving agent is what tells the 403 apart from a silently accepted
    // delete. Read directly, not polled: the point here is that no deletion
    // was ever queued, so waiting for one would only slow the test down.
    await turnAiOn(ownerApi);
    const { status: survives } = await aiChat.getAgentInfo("owner", agentId);
    expect(survives).toBe(200);

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("PUT /ai/agents/agentquota - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest AI Disabled Quota Agent",
      profileId,
    });

    const before = await aiChat.updateAgentsQuota("owner", {
      roomIds: [agentId],
      quota: VALID_QUOTA_BYTES,
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiChat.updateAgentsQuota("owner", {
      roomIds: [agentId],
      quota: VALID_QUOTA_BYTES,
    });

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("PUT /ai/agents/resetquota - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest AI Disabled Reset Quota Agent",
      profileId,
    });

    const { status: setStatus } = await aiChat.updateAgentsQuota("owner", {
      roomIds: [agentId],
      quota: VALID_QUOTA_BYTES,
    });
    expect(setStatus).toBe(200);

    const before = await aiChat.resetAgentsQuota("owner", {
      roomIds: [agentId],
    });
    expect(before.status).toBe(200);

    await turnAiOff(ownerApi);

    const { status, error } = await aiChat.resetAgentsQuota("owner", {
      roomIds: [agentId],
    });

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET /ai/profiles/list - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const before = await aiChat.getProfiles("owner");
    expect(before.status).toBe(200);
    expect(Array.isArray(before.data)).toBe(true);

    await turnAiOff(ownerApi);

    // An empty array would also be what a 403 body normalises to, so the
    // catalogue call is asserted on its status and error, not on its payload.
    const { status, error } = await aiChat.getProfiles("owner");

    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("GET|PUT|DELETE /ai/agents/:id - AI access is checked before the agent is looked up", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The companion to the tests above, which use real agents: on a nonexistent
    // id the guard answers 403 where the portal would otherwise answer 404, so
    // the 403 cannot be explained by the resource being missing.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
    const profileId = await aiChat.defaultProfileId("owner");

    await test.step("with AI on, a nonexistent agent is a 404", async () => {
      const { status } = await aiChat.getAgentInfo("owner", fakeAgentId);
      expect(status).toBe(404);
    });

    await turnAiOff(ownerApi);

    await test.step("GET", async () => {
      const { status, error } = await aiChat.getAgentInfo("owner", fakeAgentId);
      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });

    await test.step("PUT", async () => {
      const { status, error } = await aiChat.updateAgent("owner", fakeAgentId, {
        title: "Autotest AI Disabled Agent",
        tags: ["autotest"],
        profileId,
        prompt: "You are a test assistant",
      });
      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });

    await test.step("DELETE", async () => {
      const { status, error } = await aiChat.deleteAgent("owner", fakeAgentId);
      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });
  });
});

// The other off-state: the portal AI switch is ON but the "AI Tools" wallet
// service was never paid for. Unlike the switch, it gates nothing here — the
// whole agent surface keeps working, and only inference fails (asynchronously,
// see chat.ai-disabled.spec.ts).
//
// One representative chain rather than a per-route copy of the block above: the
// routes share the AI-access guard, so what is worth pinning is that the wallet
// state does not reach any of them. Each step is checked by reading the result
// back, so a 200 that did nothing cannot pass for "not gated".

test.describe("AI Agents - AI Tools wallet service not paid for", () => {
  test("GET|POST|PUT|DELETE /ai/agents - the agent surface is not gated by the AI Tools wallet service", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await configureAiToolsAsUnpaid(ownerApi);

    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profileId = await test.step("GET /ai/profiles/list", async () => {
      const { status, data } = await aiChat.getProfiles("owner");
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data!.length).toBeGreaterThan(0);
      return AiAgentChat.pickTextProfile(data!).id;
    });

    const agentId = await test.step("POST /ai/agents", async () => {
      const { status, data } = await aiChat.createAgent("owner", {
        title: "Autotest Unpaid Wallet Agent",
        tags: ["autotest"],
        profileId,
        prompt: "Original prompt",
      });
      expect(status).toBe(200);
      const id = data?.response?.id;
      expect(id).toBeDefined();
      return id!;
    });

    await test.step("GET /ai/agents and /ai/agents/:id", async () => {
      const { status, data } = await aiChat.getAgents("owner");
      expect(status).toBe(200);
      expect(data?.response?.folders?.map((agent) => agent.id)).toContain(
        agentId,
      );

      const info = await aiChat.getAgentInfo("owner", agentId);
      expect(info.status).toBe(200);
      expect(info.data?.response?.title).toBe("Autotest Unpaid Wallet Agent");
      expect(info.data?.response?.chatSettings?.prompt).toBe("Original prompt");
    });

    await test.step("PUT /ai/agents/:id", async () => {
      const { status } = await aiChat.updateAgent("owner", agentId, {
        title: "Autotest Unpaid Wallet Agent Renamed",
        profileId,
        prompt: "Updated prompt",
      });
      expect(status).toBe(200);

      const { data } = await aiChat.getAgentInfo("owner", agentId);
      expect(data?.response?.title).toBe(
        "Autotest Unpaid Wallet Agent Renamed",
      );
      expect(data?.response?.chatSettings?.prompt).toBe("Updated prompt");
    });

    await test.step("PUT /ai/agents/agentquota", async () => {
      // The stored limit is not exposed anywhere — measured on a live portal:
      // no `quotaLimit` on `GET /ai/agents/:id`, in the `GET /ai/agents` list,
      // or in the agentquota/resetquota response bodies. So the strongest
      // available signal is the route answering with the agent it acted on.
      //
      // `resetquota` is deliberately left out of this chain for the same
      // reason: with nothing readable it would add a second bare 200 without
      // proving anything the line below does not already cover. Its own gating
      // is pinned in the AI-switch block above.
      const { status, data } = await aiChat.updateAgentsQuota("owner", {
        roomIds: [agentId],
        quota: VALID_QUOTA_BYTES,
      });
      expect(status).toBe(200);
      expect(data?.response?.map((agent) => agent.id)).toContain(agentId);
    });

    await test.step("GET /ai/agents/news", async () => {
      const { status } = await aiChat.getAgentsNewItems("owner");
      expect(status).toBe(200);
    });

    await test.step("DELETE /ai/agents/:id", async () => {
      const { status } = await aiChat.deleteAgent("owner", agentId);
      expect(status).toBe(200);
      expect(await aiChat.waitForAgentDeleted("owner", agentId)).toBe(404);
    });
  });
});
