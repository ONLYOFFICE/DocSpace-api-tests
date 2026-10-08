import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  gatewayMessage,
  postRaw,
  providePassthrough,
} from "@/src/helpers/openai-passthrough";
import type { Role } from "@/src/services/token-store";
import type { UserType } from "@/src/services/api-sdk";

// Who may use the OpenAI passthrough (chat/completions, images/generations).
//
// Measured 2026-10-07: the Owner, a DocSpace admin, a room admin and a User all
// get through to the gateway; a Guest is refused with 403 on every route, the
// stream variant included. For the first three "got through" is proven by what
// the gateway itself answers — a 200 chat completion, and for images a 400
// `model is not an image model` for a text profile, which only the gateway can
// say. A 403 would have come from DocSpace.
//
// One authenticated member per test on purpose, owner-side setup first: the
// request context is shared and its session cookie beats the bearer token.

const ALLOWED: Array<{ type: UserType; role: Role }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
];

const chatBody = (model: string) => ({
  model,
  max_tokens: 16,
  messages: [{ role: "user", content: "Reply with the word OK" }],
});

test.describe("OpenAI passthrough - permissions by user type", () => {
  for (const { type, role } of ALLOWED) {
    test(`POST chat/completions - ${role} gets a chat.completion`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const { chatProfileId, chatModel } = await providePassthrough(
        apiSdk,
        paymentsApi,
      );

      await apiSdk.addAuthenticatedMember("owner", type);
      const { status, data } = await apiSdk
        .forRole(role)
        .openaiPassthrough.aiOpenaiChatCompletions({
          profileId: chatProfileId,
          requestBody: chatBody(chatModel),
        });

      expect(status).toBe(200);
      expect(data.object).toBe("chat.completion");
    });

    test(`POST images/generations - ${role} reaches the gateway`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const { chatProfileId, chatModel } = await providePassthrough(
        apiSdk,
        paymentsApi,
      );

      await apiSdk.addAuthenticatedMember("owner", type);
      // A text model on purpose: the gateway's own refusal proves the request got
      // past DocSpace's access check without paying for an image.
      const result = await postRaw(apiSdk, role, chatProfileId, "images", {
        model: chatModel,
        prompt: "a red circle",
      });

      expect(result.status).toBe(400);
      expect(gatewayMessage(result)).toBe("model is not an image model");
    });
  }

  test("POST chat/completions, images/generations, stream - a Guest is refused with 403", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel, imageProfileId, imageModel } =
      await providePassthrough(apiSdk, paymentsApi);

    // Positive control: the very same request works for the Owner, so the 403
    // below is about the caller and not about an unprovisioned portal.
    const control = await postRaw(
      apiSdk,
      "owner",
      chatProfileId,
      "chat",
      chatBody(chatModel),
    );
    expect(control.status).toBe(200);

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const chat = await postRaw(
      apiSdk,
      "guest",
      chatProfileId,
      "chat",
      chatBody(chatModel),
    );
    const stream = await postRaw(apiSdk, "guest", chatProfileId, "chat", {
      ...chatBody(chatModel),
      stream: true,
    });
    const images = await postRaw(apiSdk, "guest", imageProfileId, "images", {
      model: imageModel,
      prompt: "a red circle",
    });

    expect(chat.status).toBe(403);
    expect(stream.status).toBe(403);
    expect(images.status).toBe(403);
  });
});
