import { AiAgentChat, HostTool } from "./ai-agent-chat";

// The smallest deterministic tool the suite has: a client-supplied ("host") tool
// the model reliably reaches for when asked by name. The pause it causes is the
// observable side of every approval rule — see mcp/mcp.spec.ts for the pause
// contract and mcp/mcp.tool-permission-mode.spec.ts for how the user's mode
// steers it.

export const WEATHER_TOOL: HostTool = {
  name: "get_weather",
  description: "Get the current weather for a city.",
  inputSchema: {
    type: "object",
    properties: { city: { type: "string", description: "City name" } },
    required: ["city"],
    additionalProperties: false,
  },
  enabled: true,
  requireApproval: true,
};

export const ASK_FOR_TOOL =
  "What is the weather in Paris? Call the get_weather tool.";

/** Fresh agent + thread on a text profile, ready to be sent a message. */
export async function setupChat(
  aiChat: AiAgentChat,
  title = "Autotest Host Tools Agent",
) {
  const profileId = await aiChat.defaultProfileId("owner");
  const agentId = await aiChat.createAgentId("owner", { title, profileId });
  const threadId = await aiChat.createThreadId("owner", {
    title: "Autotest host tool thread",
    profileId,
    agentId,
  });
  return { profileId, agentId, threadId };
}
