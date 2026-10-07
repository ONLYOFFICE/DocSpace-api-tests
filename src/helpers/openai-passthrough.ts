import { expect } from "@playwright/test";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import type { ApiSDK } from "@/src/services/api-sdk";

// `POST /ai/openai/{profileId}/v1/chat/completions` and `.../images/generations`
// (SDK: OpenAIPassthroughApi). Measured 2026-10-07.
//
// The route is NOT the old generic `/ai/openai/{providerId}/v1/{path}` proxy that
// the SSRF tests in providers/ still poke at: that one answers an empty 404, this
// one reaches a live Go gateway. The body is forwarded to the provider verbatim,
// so the shape is the provider's, and the gateway adds its own error envelope:
// `{"error":{"code":"gateway_error","message":"...","type":"bad_request"}}`.
// An unknown `profileId` never reaches the gateway — DocSpace answers
// `{"error":"Bad Request"}` itself.

/** Decimal on purpose: the cap is about 30 000 000 bytes, 29 MiB is already over it. */
export const MB = 1_000_000;

/** Any of these in a response means the server leaked an implementation detail. */
export const INTERNAL_DETAILS =
  /HttpRequestException|System\.Net|ai-gateway|Connection refused|"stack"\s*:\s*"|\bat System\./;

export function expectNoInternalDetails(text: string) {
  expect(
    text.match(INTERNAL_DETAILS)?.[0],
    `response leaks internals: ${text.slice(0, 300)}`,
  ).toBeUndefined();
}

export type Endpoint = "chat" | "images";

const PATH: Record<Endpoint, string> = {
  chat: "chat/completions",
  images: "images/generations",
};

export type PassthroughContext = {
  /** Text profile: the deterministic pick the rest of the AI suite uses. */
  chatProfileId: string;
  chatModel: string;
  /** Image-only profile (capabilities 2, canUseTool false). */
  imageProfileId: string;
  imageModel: string;
};

/** Funds the portal, enables the AI gateway and resolves one chat + one image profile. */
export async function providePassthrough(
  apiSdk: ApiSDK,
  paymentsApi: Parameters<typeof enableAiGateway>[0],
): Promise<PassthroughContext> {
  const ownerApi = apiSdk.forRole("owner");
  await enableAiGateway(paymentsApi, ownerApi.payment);

  const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);
  const profiles = await aiChat.listProfiles("owner");
  const text = AiAgentChat.pickTextProfile(profiles);
  // Prefer the lite one: same contract, a third of the latency.
  const image =
    profiles.find((p) => p.modelId === "gemini-3.1-flash-lite-image") ??
    profiles.find((p) => p.canUseTool === false && /image/.test(p.modelId!));

  expect(text?.id, "a text profile is offered").toBeTruthy();
  expect(image?.id, "an image-only profile is offered").toBeTruthy();
  return {
    chatProfileId: text.id!,
    chatModel: text.modelId!,
    imageProfileId: image!.id!,
    imageModel: image!.modelId!,
  };
}

export type RawResult = {
  status: number;
  text: string;
  /** Parsed body, or the raw text when it is not JSON (SSE, HTML). */
  data: any;
};

/** POST straight at the route so the body and the profile id go out verbatim. */
export function postRaw(
  apiSdk: ApiSDK,
  role: Parameters<ApiSDK["aiOpenAiProxyRaw"]>[0],
  profileId: string,
  endpoint: Endpoint,
  body: unknown,
  contentType = "application/json",
): Promise<RawResult> {
  return apiSdk.aiOpenAiProxyRaw(role, profileId, PATH[endpoint], {
    method: "POST",
    body,
    contentType,
  });
}

/** `error.message` of a gateway envelope, or undefined for any other shape. */
export const gatewayMessage = (r: RawResult): string | undefined =>
  r.data?.error?.message;

/** A JSON body of exactly `bytes` bytes: `{"model":…, "<field>":"xxx…"}`. */
export function bodyOfSize(
  bytes: number,
  model: string,
  endpoint: Endpoint,
): string {
  const build = (n: number) =>
    JSON.stringify(
      endpoint === "chat"
        ? { model, messages: [{ role: "user", content: "x".repeat(n) }] }
        : { model, prompt: "x".repeat(n) },
    );
  const overhead = build(0).length;
  return build(bytes - overhead);
}
