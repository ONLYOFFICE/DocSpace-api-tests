import { expect, request } from "@playwright/test";
import { FolderType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import {
  AiPreferences,
  TOOL_PERMISSION_MODES,
  ToolPermissionMode,
} from "@/src/helpers/ai-preferences";
import { AiSettings } from "@/src/helpers/ai-settings";
import { AiAgentChat, HostTool } from "@/src/helpers/ai-agent-chat";
import { AiTools } from "@/src/helpers/ai-tools";
import { agentStorageFolderId } from "@/src/helpers/device-upload";
import { listFolderFiles } from "@/src/helpers/text-to-docx";
import {
  ASK_FOR_TOOL,
  WEATHER_TOOL,
  setupChat,
} from "@/src/helpers/ai-host-tool";
import { ApiSDK } from "@/src/services/api-sdk";
import { TokenStore } from "@/src/services/token-store";
import { PaymentApi as PortalPaymentApi } from "@/src/services/payment-api";

// Whether a tool call stops for the user's approval is decided by a per-user
// "tool permission mode" first, then by the tool's own `requireApproval` and the
// persisted allow-always list. This file pins the setting itself and, below, how
// it steers `tool-call-pending.autoAllow`.
//
//   GET /ai/preferences/get-tool-permission-mode   -> "ask" | "auto" | "allow"
//   PUT /ai/preferences/set-tool-permission-mode   { value }
//   GET /ai/config/user, GET /ai/config            -> toolPermissionMode: 0 | 1 | 2
//
// Measured 2026-10-05. The mode is user-scoped, has no clear route and defaults
// to "auto" — that default is what the backend does today, not something the
// developers have promised (see the first test).

test.describe("MCP - tool permission mode setting", () => {
  test("GET /api/2.0/ai/preferences/get-tool-permission-mode - a fresh user is on auto (observed backend default, not a guaranteed contract)", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const settings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const mode = await preferences.getToolPermissionMode("owner");
    expect(mode.status).toBe(200);
    expect(mode.data).toBe("auto");

    const userConfig = await settings.getUserConfig("owner");
    expect(userConfig.status).toBe(200);
    expect(userConfig.data?.response?.toolPermissionMode).toBe(1);

    const portalConfig = await settings.getAiConfig("owner");
    expect(portalConfig.status).toBe(200);
    expect(portalConfig.data?.response?.toolPermissionMode).toBe(1);
  });

  test("PUT /api/2.0/ai/preferences/set-tool-permission-mode - ask, allow and auto each round-trip through the string and the numeric read", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const settings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // Never the same value twice in a row, and the first step differs from the
    // default, so a write that was silently dropped cannot read back as correct.
    const order = ["ask", "allow", "auto"] as const;
    for (const value of order) {
      const expected = TOOL_PERMISSION_MODES.find(
        (mode) => mode.value === value,
      )!;

      await test.step(`${expected.label} (${value})`, async () => {
        const put = await preferences.setToolPermissionMode("owner", { value });
        expect(put.status).toBe(200);
        expect(put.data?.success).toBe(true);

        const mode = await preferences.getToolPermissionMode("owner");
        expect(mode.status).toBe(200);
        expect(mode.data).toBe(value);

        const userConfig = await settings.getUserConfig("owner");
        expect(userConfig.status).toBe(200);
        expect(userConfig.data?.response?.toolPermissionMode).toBe(
          expected.numeric,
        );

        const portalConfig = await settings.getAiConfig("owner");
        expect(portalConfig.status).toBe(200);
        expect(portalConfig.data?.response?.toolPermissionMode).toBe(
          expected.numeric,
        );
      });
    }
  });

  test("PUT /api/2.0/ai/preferences/set-tool-permission-mode - an unknown string, a number and a wrong key are 400 and leave the mode alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const settings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // A non-default mode to defend: after each refusal it must still be there.
    const set = await preferences.setToolPermissionMode("owner", {
      value: "ask",
    });
    expect(set.status).toBe(200);
    expect((await preferences.getToolPermissionMode("owner")).data).toBe("ask");

    const bodies: Array<[string, Record<string, unknown>]> = [
      ["an unknown string", { value: "sometimes" }],
      // The numeric twin that /ai/config/user reports is not accepted on input.
      ["a number instead of the string", { value: 2 }],
      ["the right value under the wrong key", { mode: "allow" }],
    ];

    for (const [label, body] of bodies) {
      await test.step(label, async () => {
        const put = await preferences.setToolPermissionMode("owner", body);
        expect(put.status).toBe(400);

        const mode = await preferences.getToolPermissionMode("owner");
        expect(mode.status).toBe(200);
        expect(mode.data).toBe("ask");

        const userConfig = await settings.getUserConfig("owner");
        expect(userConfig.data?.response?.toolPermissionMode).toBe(0);
      });
    }
  });
});

// How the mode steers `tool-call-pending.autoAllow` for a client-supplied
// (host) tool, measured 2026-10-05. `autoAllow: true` means the client runs the
// tool without a dialog; `false` means the stream is parked until the user
// approves. For a host tool the execution itself is always the client's job, so
// "executed" is never asserted here — the pause flag is the contract.
//
//   mode   requireApproval: true   false   not set     allow-always saved
//   ask         false              false   false        true
//   auto        false              true    false        true
//   allow       true               true    true         true
//
// So: `ask` asks about everything, `auto` believes the tool's own flag and
// treats a missing one as "ask", `allow` asks about nothing, and a saved
// allow-always wins in every mode. The allow-always entry is keyed by tool
// name, so it is written LAST in each test — after it, all three tool variants
// are pre-approved.
//
// The model decides whether to call the tool at all. There is deliberately no
// retry: a missing pause fails with the frames that did arrive, and stability is
// measured with --repeat-each.

function hostTool(requireApproval?: boolean): HostTool {
  const tool: HostTool = { ...WEATHER_TOOL };
  if (requireApproval === undefined) {
    delete tool.requireApproval;
  } else {
    tool.requireApproval = requireApproval;
  }
  return tool;
}

const REQUIRES_APPROVAL = hostTool(true);
const OPTED_OUT = hostTool(false);
const FLAG_UNSET = hostTool();

async function modeHarness(apiSdk: ApiSDK, paymentsApi: PortalPaymentApi) {
  await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const aiTools = new AiTools(apiSdk.request, apiSdk.tokenStore);
  const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
  const { profileId, agentId } = await setupChat(aiChat);

  const setMode = async (value: ToolPermissionMode) => {
    const put = await preferences.setToolPermissionMode("owner", { value });
    expect(put.status, `PUT mode ${value}`).toBe(200);
    const mode = await preferences.getToolPermissionMode("owner");
    expect(mode.data, `the mode reads back as ${value}`).toBe(value);
  };

  const storedAllowAlways = async () => {
    const stored = await aiTools.getAllowAlways("owner", agentId);
    expect(stored.status).toBe(200);
    return stored.data ?? [];
  };

  const createThread = (title: string) =>
    aiChat.createThreadId("owner", { title, profileId, agentId });

  /**
   * One tool call, in a brand-new thread unless `existingThreadId` says
   * otherwise; returns the pause it ended on.
   */
  const callTool = async (
    tool: HostTool,
    label: string,
    existingThreadId?: string,
  ) => {
    const threadId = existingThreadId ?? (await createThread(label));
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId,
      message: ASK_FOR_TOOL,
      tools: [tool],
    });
    const frames = AiAgentChat.frameTypes(sent.text);
    const pending = AiAgentChat.pendingToolCall(sent.text);
    expect(
      pending,
      `${label}: the model did not ask for the tool; frames were ${frames.join(", ")}`,
    ).toBeDefined();
    // The stream stops on the pause whether or not a dialog is due.
    expect(frames.at(-1), `${label}: the pause is the last frame`).toBe(
      "tool-call-pending",
    );
    expect(frames, `${label}: nothing resumed by itself`).not.toContain(
      "message-end",
    );
    return { pending: pending!, threadId };
  };

  const expectAutoAllow = async (
    tool: HostTool,
    label: string,
    autoAllow: boolean,
    existingThreadId?: string,
  ) => {
    const call = await callTool(tool, label, existingThreadId);
    expect(call.pending.autoAllow, `${label}: autoAllow`).toBe(autoAllow);
    return call;
  };

  /** The user's decision. Resumes the reply; `allowAlways` is the dialog's box. */
  const approve = async (
    call: Awaited<ReturnType<typeof callTool>>,
    tool: HostTool,
    label: string,
    allowAlways?: boolean,
  ) => {
    const approved = await aiChat.approvePendingToolCall(
      "owner",
      call.pending,
      {
        threadId: call.threadId,
        profileId,
        agentId,
        tools: [tool],
        result: "21C and sunny",
        allowAlways,
      },
    );
    expect(approved.status, `${label}: approve`).toBe(200);
    expect(
      AiAgentChat.frameTypes(approved.text),
      `${label}: the approval resumes the reply`,
    ).toContain("message-end");
  };

  return { setMode, storedAllowAlways, createThread, expectAutoAllow, approve };
}

test.describe("MCP - tool permission mode steers the approval pause", () => {
  test("BUG XXXXX: POST /api/2.0/ai/ai/send-with-stream - ask: every host tool waits for approval until an allow-always is saved", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { setMode, storedAllowAlways, expectAutoAllow, approve } =
      await modeHarness(apiSdk, paymentsApi);

    await setMode("ask");
    expect(await storedAllowAlways(), "nothing is pre-approved").toEqual([]);

    // `ask` overrules the tool's own opt-out.
    await test.step("requireApproval: false still asks", async () => {
      await expectAutoAllow(OPTED_OUT, "ask, requireApproval false", false);
    });
    await test.step("no requireApproval asks", async () => {
      await expectAutoAllow(FLAG_UNSET, "ask, flag unset", false);
    });

    await test.step("requireApproval: true asks, and Allow-always is saved from the dialog", async () => {
      const call = await expectAutoAllow(
        REQUIRES_APPROVAL,
        "ask, requireApproval true",
        false,
      );
      await approve(call, REQUIRES_APPROVAL, "ask, requireApproval true", true);
      expect(await storedAllowAlways()).toContain(WEATHER_TOOL.name);
    });

    await test.step("a saved allow-always wins in ask", async () => {
      // Since 2026-10-07 `ask` ignores the saved allow-always (autoAllow stays
      // false); `auto` and `allow` still honour it.
      test.fail();
      await expectAutoAllow(REQUIRES_APPROVAL, "ask, allow-always saved", true);
    });
  });

  test("POST /api/2.0/ai/ai/send-with-stream - auto: a host tool follows its own requireApproval and a missing flag asks", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { setMode, storedAllowAlways, expectAutoAllow, approve } =
      await modeHarness(apiSdk, paymentsApi);

    await setMode("auto");
    expect(await storedAllowAlways(), "nothing is pre-approved").toEqual([]);

    await test.step("requireApproval: false is let through", async () => {
      await expectAutoAllow(OPTED_OUT, "auto, requireApproval false", true);
    });
    await test.step("no requireApproval asks", async () => {
      await expectAutoAllow(FLAG_UNSET, "auto, flag unset", false);
    });

    await test.step("requireApproval: true asks, and Allow-always is saved from the dialog", async () => {
      const call = await expectAutoAllow(
        REQUIRES_APPROVAL,
        "auto, requireApproval true",
        false,
      );
      await approve(
        call,
        REQUIRES_APPROVAL,
        "auto, requireApproval true",
        true,
      );
      expect(await storedAllowAlways()).toContain(WEATHER_TOOL.name);
    });

    await test.step("a saved allow-always wins in auto", async () => {
      await expectAutoAllow(
        REQUIRES_APPROVAL,
        "auto, allow-always saved",
        true,
      );
    });
  });

  test("POST /api/2.0/ai/ai/send-with-stream - allow: nothing waits, whatever the tool's requireApproval says", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { setMode, storedAllowAlways, expectAutoAllow, approve } =
      await modeHarness(apiSdk, paymentsApi);

    await setMode("allow");
    expect(await storedAllowAlways(), "nothing is pre-approved").toEqual([]);

    // `allow` overrules the tool's own requirement; nothing is saved to get here.
    await test.step("requireApproval: true is let through", async () => {
      await expectAutoAllow(
        REQUIRES_APPROVAL,
        "allow, requireApproval true",
        true,
      );
    });
    await test.step("requireApproval: false is let through", async () => {
      await expectAutoAllow(OPTED_OUT, "allow, requireApproval false", true);
    });
    await test.step("no requireApproval is let through", async () => {
      await expectAutoAllow(FLAG_UNSET, "allow, flag unset", true);
    });

    await test.step("an allow-always saved on top changes nothing", async () => {
      const call = await expectAutoAllow(
        REQUIRES_APPROVAL,
        "allow, before saving",
        true,
      );
      await approve(call, REQUIRES_APPROVAL, "allow, before saving", true);
      expect(await storedAllowAlways()).toContain(WEATHER_TOOL.name);
      await expectAutoAllow(
        REQUIRES_APPROVAL,
        "allow, allow-always saved",
        true,
      );
    });
  });
});

test.describe("MCP - tool permission mode, scope and switching", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - a mode change applies to both existing and newly created threads", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { setMode, createThread, expectAutoAllow } = await modeHarness(
      apiSdk,
      paymentsApi,
    );

    // Thread A exists before the mode is touched; the default (auto) would ask
    // about a requireApproval:true tool, so a change of mode is the only thing
    // that can turn the answer into "allow".
    const threadA = await createThread(
      "Autotest thread created before the mode change",
    );

    await setMode("allow");

    await test.step("the thread that already existed follows the new mode", async () => {
      await expectAutoAllow(
        REQUIRES_APPROVAL,
        "existing thread, allow",
        true,
        threadA,
      );
    });

    await test.step("a thread created afterwards follows it too", async () => {
      const threadB = await createThread(
        "Autotest thread created after the mode change",
      );
      await expectAutoAllow(
        REQUIRES_APPROVAL,
        "new thread, allow",
        true,
        threadB,
      );
    });
  });

  test("GET|PUT /api/2.0/ai/preferences/*-tool-permission-mode - tool permission mode is isolated between users", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

    // Two sessions that share nothing: the suite's own request context carries
    // the owner's session cookie, which beats a Bearer token, so each side gets
    // its own context and its own token store instead.
    const store = apiSdk.tokenStore;
    const sessionStore = (role: "owner" | "user", token: string) => {
      const copy = new TokenStore();
      copy.newTenantDomain = store.newTenantDomain;
      copy.portalDomain = store.portalDomain;
      copy.isLocal = store.isLocal;
      copy.setToken(role, token);
      return copy;
    };

    // A plain member: authenticating through the suite's shared context would
    // re-point it at the member.
    const member = await apiSdk.addMember("owner", "User");
    expect(member.status).toBe(200);
    const memberId = member.data.response!.id!;

    const ownerContext = await request.newContext();
    const memberContext = await request.newContext();
    try {
      const login = await memberContext.post(
        `${store.portalBaseUrl}/api/2.0/authentication`,
        {
          data: {
            userName: member.userData.email,
            password: member.userData.password,
          },
          headers: { Origin: `http://${store.newTenantDomain}` },
        },
      );
      expect(login.status(), "the member logs in").toBe(200);
      const memberToken = (await login.json()).response.token as string;

      const owner = new AiPreferences(
        ownerContext,
        sessionStore("owner", store.getToken("owner")),
      );
      const user = new AiPreferences(
        memberContext,
        sessionStore("user", memberToken),
      );
      const ownerSettings = new AiSettings(
        ownerContext,
        sessionStore("owner", store.getToken("owner")),
      );
      const userSettings = new AiSettings(
        memberContext,
        sessionStore("user", memberToken),
      );

      // Premise: the two sides really are two different people.
      const ownerId = await owner.whoAmI("owner");
      await user.expectActingAs("user", memberId, "the member");
      expect(ownerId, "the owner is not the member").not.toBe(memberId);

      const read = async () => ({
        owner: (await owner.getToolPermissionMode("owner")).data,
        user: (await user.getToolPermissionMode("user")).data,
        ownerNumeric: (await ownerSettings.getUserConfig("owner")).data
          ?.response?.toolPermissionMode,
        userNumeric: (await userSettings.getUserConfig("user")).data?.response
          ?.toolPermissionMode,
      });

      // Observed default; the point here is that both start from the same place.
      expect(await read()).toEqual({
        owner: "auto",
        user: "auto",
        ownerNumeric: 1,
        userNumeric: 1,
      });

      expect(
        (await owner.setToolPermissionMode("owner", { value: "allow" })).status,
      ).toBe(200);
      expect(await read(), "the owner's write leaves the member alone").toEqual(
        {
          owner: "allow",
          user: "auto",
          ownerNumeric: 2,
          userNumeric: 1,
        },
      );

      expect(
        (await user.setToolPermissionMode("user", { value: "ask" })).status,
      ).toBe(200);
      expect(await read(), "the member's write leaves the owner alone").toEqual(
        {
          owner: "allow",
          user: "ask",
          ownerNumeric: 2,
          userNumeric: 0,
        },
      );
    } finally {
      await ownerContext.dispose();
      await memberContext.dispose();
    }
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a new mode applies to the next tool call", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { setMode, storedAllowAlways, expectAutoAllow } = await modeHarness(
      apiSdk,
      paymentsApi,
    );
    expect(await storedAllowAlways(), "nothing is pre-approved").toEqual([]);

    // Five calls, each in its own thread, each one differing from the previous
    // answer in the one thing that moved: the mode (steps 1-2), the tool's flag
    // (2-3), the mode again (3-4, 4-5). No step can pass on a stale mode.
    const steps: Array<{
      mode: ToolPermissionMode;
      tool: HostTool;
      flag: string;
      autoAllow: boolean;
    }> = [
      { mode: "ask", tool: OPTED_OUT, flag: "false", autoAllow: false },
      { mode: "auto", tool: OPTED_OUT, flag: "false", autoAllow: true },
      { mode: "auto", tool: REQUIRES_APPROVAL, flag: "true", autoAllow: false },
      { mode: "allow", tool: REQUIRES_APPROVAL, flag: "true", autoAllow: true },
      { mode: "ask", tool: REQUIRES_APPROVAL, flag: "true", autoAllow: false },
    ];

    for (const [index, step] of steps.entries()) {
      const label = `${step.mode}, requireApproval ${step.flag}`;
      await test.step(`${index + 1}. ${label} -> autoAllow ${step.autoAllow}`, async () => {
        await setMode(step.mode);
        await expectAutoAllow(step.tool, label, step.autoAllow);
      });
    }

    expect(await storedAllowAlways(), "no allow-always masked a step").toEqual(
      [],
    );
  });
});

test.describe("MCP - tool permission mode and the user config", () => {
  test("PUT /api/2.0/ai/config/user - saving another preference leaves the tool permission mode alone", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

    const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
    const settings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // The mode shares a document with `chatRecommendedModelVisible` in
    // /ai/config/user, so a save of the other field could in principle reset it
    // to the default. A non-default value makes that visible.
    const set = await preferences.setToolPermissionMode("owner", {
      value: "allow",
    });
    expect(set.status).toBe(200);
    expect((await preferences.getToolPermissionMode("owner")).data).toBe(
      "allow",
    );

    await test.step("saving the other field", async () => {
      const put = await settings.setUserConfig("owner", {
        chatRecommendedModelVisible: false,
      });
      expect(put.status).toBe(200);
      expect(put.data?.response?.chatRecommendedModelVisible).toBe(false);

      const read = await settings.getUserConfig("owner");
      expect(read.data?.response?.chatRecommendedModelVisible).toBe(false);
      expect(read.data?.response?.toolPermissionMode).toBe(2);
      expect((await preferences.getToolPermissionMode("owner")).data).toBe(
        "allow",
      );
    });

    await test.step("saving an empty body", async () => {
      const put = await settings.setUserConfig("owner", {});
      expect(put.status).toBe(200);
      expect((await preferences.getToolPermissionMode("owner")).data).toBe(
        "allow",
      );
      expect(
        (await settings.getUserConfig("owner")).data?.response
          ?.toolPermissionMode,
      ).toBe(2);
    });
  });
});

// Server-executed tools (the built-in generators and the DocSpace REST family)
// are run by the engine itself, so the mode treats them differently from a host
// tool, measured 2026-10-05:
//
//                          ask                 auto                allow
//   generate_docx (write)  pause, autoAllow    pause, autoAllow    no pause, runs
//                          false, waits        false, waits
//   get_my_folder (read)   pause, autoAllow    no pause, runs      no pause, runs
//                          false, waits
//   create_folder (write)  -                   pause, autoAllow    -
//                                              false, waits
//
// Every pause carries `serverExecuted: true` and the stream ends on it; approving
// WITHOUT a `result` is what makes the engine run the tool. Where there is no
// pause there is no `autoAllow: true` frame either: the engine just runs the tool
// and the reply finishes. What makes `auto` treat the read tool and the two write
// tools differently is not visible anywhere in the API (the tool catalogue is
// empty and carries no metadata) — presumably a read/write or dangerous
// classification inside the engine, which is why the rows are named after what
// the tool does and not after a flag.

const NO_TOOL = "NO SUCH TOOL";
const GENERATOR = "onlyoffice_generate_docx";
// Names the tool outright, the way the host-tool prompt does: asking for "a
// document" alone sometimes got a prose answer instead of a call.
const ASK_FOR_DOCX_FILE =
  `Call the ${GENERATOR} tool to create a .docx document titled ProbeDoc containing the single sentence 'hello probe'. ` +
  "Use only that built-in generator — do not call any DocSpace file, folder, room or people API tool. " +
  `If you truly have no such tool, reply exactly: ${NO_TOOL}`;
const ASK_FOR_MY_FOLDER_TOOL =
  "Call the get_my_folder tool and report the id and title of my My Documents folder. " +
  `Do not generate any document. If you truly have no such tool, reply exactly: ${NO_TOOL}`;

async function serverToolHarness(
  apiSdk: ApiSDK,
  paymentsApi: PortalPaymentApi,
) {
  await enableAiGateway(paymentsApi, apiSdk.forRole("owner").payment);

  const ownerApi = apiSdk.forRole("owner");
  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const preferences = new AiPreferences(apiSdk.request, apiSdk.tokenStore);
  const { profileId, agentId } = await setupChat(
    aiChat,
    "Autotest server tool agent",
  );

  const setMode = async (value: ToolPermissionMode) => {
    const put = await preferences.setToolPermissionMode("owner", { value });
    expect(put.status, `PUT mode ${value}`).toBe(200);
    expect((await preferences.getToolPermissionMode("owner")).data).toBe(value);
  };

  /** One turn in a thread of its own, with what the model did read back. */
  const send = async (entityId: number, message: string, label: string) => {
    const threadId = await aiChat.createThreadId("owner", {
      title: label,
      profileId,
      agentId: entityId,
    });
    const sent = await aiChat.sendMessage("owner", {
      threadId,
      profileId,
      agentId: entityId,
      message,
      timeoutMs: 180000,
    });
    const frames = AiAgentChat.frameTypes(sent.text);
    const pending = AiAgentChat.pendingToolCall(sent.text);
    return { threadId, frames, pending, entityId, label };
  };

  const toolCalls = async (threadId: string) => {
    const { data } = await aiChat.readMessages("owner", threadId);
    return AiAgentChat.assistantMessages(data).flatMap((message) =>
      AiAgentChat.toolCalls(message),
    );
  };

  const pausedToolNames = (pending: { message?: unknown }) => {
    const content = (pending.message as { content?: unknown } | undefined)
      ?.content;
    return Array.isArray(content)
      ? content
          .filter((part) => part.type === "tool-call")
          .map((part) => part.toolName as string)
      : [];
  };

  /**
   * The user's "Allow" on a server-executed pause: no `result`, the engine runs
   * the tool. A model that fumbles its arguments calls the tool again, and in
   * `ask` and `auto` every such call is a pause of its own, so the user keeps
   * allowing until the reply finishes (three rounds at most). Returns the frames
   * of the last round.
   */
  const approve = async (turn: Awaited<ReturnType<typeof send>>) => {
    let pending = turn.pending!;
    let frames: string[] = [];
    for (let round = 1; round <= 3; round += 1) {
      const approved = await aiChat.approveToolCall("owner", {
        threadId: turn.threadId,
        messageId: pending.messageId,
        idx: pending.idx ?? 0,
        message: pending.message,
        entityId: String(turn.entityId),
        profileId,
      });
      expect(approved.status, `${turn.label}: approve, round ${round}`).toBe(
        200,
      );
      frames = AiAgentChat.frameTypes(approved.text);
      const next = AiAgentChat.pendingToolCall(approved.text);
      if (!next) break;
      pending = next;
    }
    return frames;
  };

  /** A turn that stopped for approval: a server pause nothing has run behind. */
  const expectServerPause = (
    turn: Awaited<ReturnType<typeof send>>,
    toolName: string,
  ) => {
    expect(
      turn.pending,
      `${turn.label}: the model did not reach for a tool that needs approval; frames were ${turn.frames.join(", ")}`,
    ).toBeDefined();
    expect(
      pausedToolNames(turn.pending!),
      `${turn.label}: paused tool`,
    ).toContain(toolName);
    expect(turn.pending!.serverExecuted, `${turn.label}: serverExecuted`).toBe(
      true,
    );
    expect(turn.pending!.autoAllow, `${turn.label}: autoAllow`).toBe(false);
    expect(turn.frames.at(-1), `${turn.label}: the pause ends the stream`).toBe(
      "tool-call-pending",
    );
    expect(
      turn.frames,
      `${turn.label}: nothing resumed by itself`,
    ).not.toContain("message-end");
  };

  /** A turn the engine carried through on its own. */
  const expectRanUnasked = (turn: Awaited<ReturnType<typeof send>>) => {
    expect(
      turn.pending,
      `${turn.label}: the engine stopped for approval; frames were ${turn.frames.join(", ")}`,
    ).toBeUndefined();
    expect(turn.frames, `${turn.label}: the reply finished`).toContain(
      "message-end",
    );
  };

  return {
    ownerApi,
    agentId,
    setMode,
    send,
    toolCalls,
    approve,
    expectServerPause,
    expectRanUnasked,
  };
}

test.describe("MCP - tool permission mode and server-executed tools", () => {
  test("POST /api/2.0/ai/ai/send-with-stream - the document generator waits for approval in ask and auto and runs unasked in allow", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const h = await serverToolHarness(apiSdk, paymentsApi);
    const resultsFolder = await agentStorageFolderId(
      h.ownerApi,
      h.agentId,
      FolderType.ChatOutputs,
    );
    const generated = async () =>
      (await listFolderFiles(h.ownerApi, resultsFolder)).length;

    for (const mode of ["ask", "auto"] as const) {
      await test.step(`${mode}: paused, nothing written until the user allows it`, async () => {
        await h.setMode(mode);
        const before = await generated();
        const turn = await h.send(h.agentId, ASK_FOR_DOCX_FILE, `${mode} docx`);
        h.expectServerPause(turn, GENERATOR);

        const waiting = (await h.toolCalls(turn.threadId)).find(
          (call) => call.toolName === GENERATOR,
        );
        expect(waiting?.result, "the tool has not run yet").toBeUndefined();
        expect(await generated(), "no file while it waits").toBe(before);

        expect(await h.approve(turn), "the reply resumes").toContain(
          "message-end",
        );
        expect(await generated(), "the file exists once allowed").toBe(
          before + 1,
        );
      });
    }

    await test.step("allow: runs without a pause and the file is there", async () => {
      await h.setMode("allow");
      const before = await generated();
      const turn = await h.send(h.agentId, ASK_FOR_DOCX_FILE, "allow docx");
      h.expectRanUnasked(turn);

      const ran = (await h.toolCalls(turn.threadId)).find(
        (call) => call.toolName === GENERATOR,
      );
      expect(ran?.result, "the generator ran").toBeDefined();
      expect(
        await generated(),
        "the file was written without an approval",
      ).toBe(before + 1);
    });
  });

  test("POST /api/2.0/ai/ai/send-with-stream - a read-only DocSpace tool waits in ask and runs unasked in auto and allow", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const h = await serverToolHarness(apiSdk, paymentsApi);

    // The REST family is offered in a chat scoped to an ordinary folder.
    const { data: myFolder } = await h.ownerApi.folders.getMyFolder({});
    const { data: created, status } = await h.ownerApi.folders.createFolder({
      folderId: myFolder.response!.current!.id!,
      createFolder: { title: "Autotest server tool folder" },
    });
    expect(status).toBe(200);
    const folderId = created.response!.id!;

    await test.step("ask: paused, then run once allowed", async () => {
      await h.setMode("ask");
      const turn = await h.send(folderId, ASK_FOR_MY_FOLDER_TOOL, "ask rest");
      h.expectServerPause(turn, "get_my_folder");

      const waiting = (await h.toolCalls(turn.threadId)).find(
        (call) => call.toolName === "get_my_folder",
      );
      expect(waiting?.result, "the tool has not run yet").toBeUndefined();

      expect(await h.approve(turn), "the reply resumes").toContain(
        "message-end",
      );
      const ran = (await h.toolCalls(turn.threadId)).find(
        (call) => call.toolName === "get_my_folder",
      );
      expect(ran?.result, "the tool ran once allowed").toBeDefined();
    });

    for (const mode of ["auto", "allow"] as const) {
      await test.step(`${mode}: runs without a pause`, async () => {
        await h.setMode(mode);
        const turn = await h.send(
          folderId,
          ASK_FOR_MY_FOLDER_TOOL,
          `${mode} rest`,
        );
        h.expectRanUnasked(turn);

        const calls = (await h.toolCalls(turn.threadId)).filter(
          (call) => call.toolName === "get_my_folder",
        );
        expect(calls, "the tool was called").not.toEqual([]);
        for (const call of calls) {
          expect(call.result, "and it ran").toBeDefined();
        }
      });
    }
  });

  test("POST /api/2.0/ai/ai/send-with-stream - auto lets a DocSpace read tool through but makes a write tool wait", async ({
    apiSdk,
    paymentsApi,
  }) => {
    test.setTimeout(480000);
    const h = await serverToolHarness(apiSdk, paymentsApi);

    const { data: myFolder } = await h.ownerApi.folders.getMyFolder({});
    const myFolderId = myFolder.response!.current!.id!;
    const { data: scope } = await h.ownerApi.folders.createFolder({
      folderId: myFolderId,
      createFolder: { title: "Autotest server tool scope" },
    });
    const scopeId = scope.response!.id!;

    const title = `AutotestWrite${Date.now()}`;
    const exists = async () => {
      const { data } = await h.ownerApi.folders.getFolderByFolderId({
        folderId: myFolderId,
      });
      return (data.response?.folders ?? []).some(
        (folder) => folder.title === title,
      );
    };

    await h.setMode("auto");
    const turn = await h.send(
      scopeId,
      `Call the create_folder tool to create a folder titled ${title} in my My Documents folder. ` +
        `Do not generate any document. If you truly have no such tool, reply exactly: ${NO_TOOL}`,
      "auto write",
    );

    // Reads the model made on the way (finding My Documents) ran unasked; the
    // write is what stopped the stream.
    h.expectServerPause(turn, "create_folder");
    expect(await exists(), "nothing created while it waits").toBe(false);

    await h.approve(turn);
    expect(await exists(), "created once allowed").toBe(true);
  });
});
