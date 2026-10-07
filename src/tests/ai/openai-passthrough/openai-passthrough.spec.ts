import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import {
  MB,
  bodyOfSize,
  expectNoInternalDetails,
  gatewayMessage,
  postRaw,
  providePassthrough,
} from "@/src/helpers/openai-passthrough";

// OpenAIPassthroughApi: the document editor's AI plugin talks to a provider
// through DocSpace. The profile (and its credentials) is resolved server-side and
// the body is forwarded verbatim, so what is asserted here is the part DocSpace
// and its gateway own: routing, validation, error envelopes, and that nothing is
// stripped from a request the provider is entitled to see.
//
// Measured 2026-10-07 (see helpers/openai-passthrough.ts for the route notes):
//
//   * the gateway REQUIRES `model` in the body. The SDK says the opposite — "the
//     model and the credentials come from the profile in the path and must not be
//     sent here" — pinned as a test.fail below;
//   * chat answers 400 for every malformed body, images answers 500 for the same
//     ones (test.fail below);
//   * the whole body is capped at about 30 000 000 bytes. Over it BOTH routes
//     answer 500 with a stack trace and the internal gateway host:port;
//   * `stream: true` is supported on chat and answers SSE.
//
// Not covered here, because it needs an upstream the test controls: provider
// 4xx/5xx/429 relayed untouched, request bodies reaching the provider
// byte-for-byte, client abort cancelling the upstream call, a disabled or
// capability-less profile, images `size`/`n`/`response_format`, and the provider
// key never appearing in a response.

const INVALID_PROFILE_IDS = [
  "999999",
  "0",
  "-1",
  "-2",
  "abc",
  "99999999999999999999",
];

// Cheap bodies that only exercise the validator: no provider is ever called.
const UNPARSEABLE_BODIES = [
  { name: "malformed JSON", body: "{bad json" },
  { name: "a JSON array", body: "[]" },
  { name: "an empty body", body: "" },
];

test.describe("POST /ai/openai/:profileId/v1/chat/completions", () => {
  test("POST chat/completions - Owner gets a chat.completion with every optional field passed through", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );

    // One real call covers several contract points: a multi-role history,
    // sampling parameters, tools + tool_choice (nested JSON), and a field no
    // OpenAI client knows — the route must not whitelist.
    const { status, data } = await apiSdk
      .forRole("owner")
      .openaiPassthrough.aiOpenaiChatCompletions({
        profileId: chatProfileId,
        requestBody: {
          model: chatModel,
          messages: [
            { role: "system", content: "You are terse." },
            { role: "user", content: "Hi" },
            { role: "assistant", content: "Hello" },
            { role: "user", content: "Reply with the word OK" },
          ],
          max_tokens: 64,
          temperature: 0.2,
          top_p: 1,
          x_autotest: { nested: [1, 2, { deep: true }] },
          tools: [
            {
              type: "function",
              function: {
                name: "lookup",
                description: "Looks a thing up",
                parameters: {
                  type: "object",
                  properties: { query: { type: "string" } },
                },
              },
            },
          ],
          tool_choice: "auto",
        },
      });

    expect(status).toBe(200);
    expect(data.object).toBe("chat.completion");
    expect(Array.isArray(data.choices)).toBe(true);
    expect(data.choices[0]?.message?.role).toBe("assistant");
  });

  test("POST chat/completions - Cyrillic, emoji, quotes and a line break survive the round trip", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );

    const { status, data } = await apiSdk
      .forRole("owner")
      .openaiPassthrough.aiOpenaiChatCompletions({
        profileId: chatProfileId,
        requestBody: {
          model: chatModel,
          temperature: 0,
          max_tokens: 200,
          messages: [
            {
              role: "user",
              content:
                'Repeat exactly this text and nothing else:\nпривет 👋 "quotes"',
            },
          ],
        },
      });

    expect(status).toBe(200);
    const reply = String(data.choices?.[0]?.message?.content ?? "");
    expect(reply).toContain("привет");
    expect(reply).toContain("👋");
    expect(reply).toContain('"quotes"');
  });

  test("POST chat/completions - a 150 KB prompt is accepted", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );

    // Words with spaces on purpose: `"x".repeat(n)` is tokenised into a huge
    // number of tokens, the provider takes >30s and CloudFront cuts it with a 504.
    // That is provider time, not a DocSpace limit.
    const { status, data } = await apiSdk
      .forRole("owner")
      .openaiPassthrough.aiOpenaiChatCompletions({
        profileId: chatProfileId,
        requestBody: {
          model: chatModel,
          max_tokens: 16,
          messages: [
            {
              role: "user",
              content: "Reply with the letter A. " + "word ".repeat(30_000),
            },
          ],
        },
      });

    expect(status).toBe(200);
    expect(data.object).toBe("chat.completion");
  });

  test("POST chat/completions - stream:true answers 200 with an SSE stream of chat.completion.chunk", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );

    const result = await postRaw(apiSdk, "owner", chatProfileId, "chat", {
      model: chatModel,
      stream: true,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the word OK" }],
    });

    expect(result.status).toBe(200);
    expect(result.text.trimStart().startsWith("data:")).toBe(true);
    expect(result.text).toContain('"object":"chat.completion.chunk"');
  });

  const CHAT_VALIDATION: Array<{
    name: string;
    body: (model: string) => unknown;
    message?: string;
  }> = [
    {
      name: "no model",
      body: () => ({ messages: [] }),
      message: "model is required",
    },
    { name: "an empty object", body: () => ({}), message: "model is required" },
    { name: "a null body", body: () => "null", message: "model is required" },
    {
      name: "no messages",
      body: (model) => ({ model }),
      message: "messages is required",
    },
    {
      name: "messages of the wrong type",
      body: (model) => ({ model, messages: "nope" }),
    },
    {
      name: "an unknown model",
      body: () => ({
        model: "no-such-model",
        messages: [{ role: "user", content: "hi" }],
      }),
      message: "unknown model",
    },
    ...UNPARSEABLE_BODIES.map(({ name, body }) => ({
      name,
      body: () => body,
    })),
  ];

  for (const { name, body, message } of CHAT_VALIDATION) {
    test(`POST chat/completions - ${name} answers 400 from the gateway`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const { chatProfileId, chatModel } = await providePassthrough(
        apiSdk,
        paymentsApi,
      );

      const result = await postRaw(
        apiSdk,
        "owner",
        chatProfileId,
        "chat",
        body(chatModel),
      );

      expect(result.status).toBe(400);
      expect(result.data?.error?.code).toBe("gateway_error");
      if (message) {
        expect(gatewayMessage(result)).toBe(message);
      }
    });
  }

  test("POST chat/completions - an unauthenticated request answers 401", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );

    const result = await postRaw(apiSdk, null, chatProfileId, "chat", {
      model: chatModel,
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.status).toBe(401);
  });
});

test.describe("POST /ai/openai/:profileId/v1/images/generations", () => {
  test("POST images/generations - Owner generates an image from a Cyrillic + emoji prompt", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { imageProfileId, imageModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );

    const { status, data } = await apiSdk
      .forRole("owner")
      .openaiPassthrough.aiOpenaiImagesGenerations({
        profileId: imageProfileId,
        requestBody: {
          model: imageModel,
          prompt: 'красный круг 🔴 на белом фоне, подпись "тест"',
        },
      });

    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    // The gateway answers inline base64; a URL would be an equally valid result
    // from another provider, so accept either rather than pin the encoding.
    const first = data.data[0];
    expect(String(first?.b64_json ?? first?.url ?? "").length).toBeGreaterThan(
      100,
    );
  });

  test("POST images/generations - a text-only model is refused with 400 'model is not an image model'", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );

    const result = await postRaw(apiSdk, "owner", chatProfileId, "images", {
      model: chatModel,
      prompt: "a red circle",
    });

    expect(result.status).toBe(400);
    expect(gatewayMessage(result)).toBe("model is not an image model");
  });

  const IMAGE_VALIDATION: Array<{
    name: string;
    body: (model: string) => unknown;
    message: string;
  }> = [
    {
      name: "no model",
      body: () => ({ prompt: "x" }),
      message: "model is required",
    },
    { name: "an empty object", body: () => ({}), message: "model is required" },
    { name: "a null body", body: () => "null", message: "model is required" },
    {
      name: "an empty prompt",
      body: (model) => ({ model, prompt: "" }),
      message: "prompt is required",
    },
    {
      name: "an unknown model",
      body: () => ({ model: "no-such-model", prompt: "x" }),
      message: "unknown model",
    },
  ];

  for (const { name, body, message } of IMAGE_VALIDATION) {
    test(`POST images/generations - ${name} answers 400 from the gateway`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const { imageProfileId, imageModel } = await providePassthrough(
        apiSdk,
        paymentsApi,
      );

      const result = await postRaw(
        apiSdk,
        "owner",
        imageProfileId,
        "images",
        body(imageModel),
      );

      expect(result.status).toBe(400);
      expect(result.data?.error?.code).toBe("gateway_error");
      expect(gatewayMessage(result)).toBe(message);
    });
  }

  // chat answers 400 for every one of these. Images binds the same body with the
  // same Go decoder but reports the failure as `internal_server_error` — a
  // client mistake surfaced as a server fault.
  const IMAGE_INVALID_BODIES: Array<{
    name: string;
    body: (model: string) => unknown;
  }> = [
    ...UNPARSEABLE_BODIES.map(({ name, body }) => ({ name, body: () => body })),
    {
      name: "a prompt of the wrong type",
      body: (model) => ({ model, prompt: 123 }),
    },
  ];

  for (const { name, body } of IMAGE_INVALID_BODIES) {
    test.fail(
      `BUG XXXXX: POST images/generations - ${name} answers 500 instead of 400`,
      async ({ apiSdk, paymentsApi }) => {
        const { imageProfileId, imageModel } = await providePassthrough(
          apiSdk,
          paymentsApi,
        );

        const result = await postRaw(
          apiSdk,
          "owner",
          imageProfileId,
          "images",
          body(imageModel),
        );

        expect(result.status).toBe(400);
      },
    );
  }

  test("POST images/generations - an unauthenticated request answers 401", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { imageProfileId, imageModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );

    const result = await postRaw(apiSdk, null, imageProfileId, "images", {
      model: imageModel,
      prompt: "x",
    });

    expect(result.status).toBe(401);
  });
});

test.describe("OpenAI passthrough - profileId validation", () => {
  for (const endpoint of ["chat", "images"] as const) {
    for (const profileId of INVALID_PROFILE_IDS) {
      test(`POST ${endpoint} - profileId "${profileId}" answers 400, not 500`, async ({
        apiSdk,
        paymentsApi,
      }) => {
        const { chatModel } = await providePassthrough(apiSdk, paymentsApi);

        const result = await postRaw(
          apiSdk,
          "owner",
          profileId,
          endpoint,
          endpoint === "chat"
            ? { model: chatModel, messages: [{ role: "user", content: "hi" }] }
            : { model: chatModel, prompt: "x" },
        );

        expect(result.status).toBe(400);
        // DocSpace refuses before the gateway: its own envelope, not gateway_error.
        expect(result.data?.error?.code).toBeUndefined();
      });
    }
  }
});

test.describe("OpenAI passthrough - body size", () => {
  // The cap is about 30 000 000 bytes (29 999 000 accepted, 30 000 000 refused).
  // It is not pinned to the byte: the tests sit well on each side of it.
  // `unknown model` is the cheapest provider-free answer, so "accepted" means
  // "read and parsed all the way to the model check" without sending a huge
  // prompt to a real model.
  for (const endpoint of ["chat", "images"] as const) {
    test(`POST ${endpoint} - a 29 MB body is read and parsed`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      const { chatProfileId } = await providePassthrough(apiSdk, paymentsApi);

      const result = await postRaw(
        apiSdk,
        "owner",
        chatProfileId,
        endpoint,
        bodyOfSize(29 * MB, "no-such-model", endpoint),
      );

      expect(result.status).toBe(400);
      expect(gatewayMessage(result)).toBe("unknown model");
    });

    test.fail(
      `BUG XXXXX: POST ${endpoint} - a 31 MB body answers 500 and leaks the stack trace and the internal gateway host`,
      async ({ apiSdk, paymentsApi }) => {
        const { chatProfileId } = await providePassthrough(apiSdk, paymentsApi);

        const result = await postRaw(
          apiSdk,
          "owner",
          chatProfileId,
          endpoint,
          bodyOfSize(31 * MB, "no-such-model", endpoint),
        );

        // The leak first: when the status is fixed but the exception text still
        // escapes (or the other way round) the test must not go green.
        expectNoInternalDetails(result.text);
        expect(result.status).toBe(413);
      },
    );
  }
});

test.describe("OpenAI passthrough - SDK documentation vs the gateway", () => {
  // `OpenAIPassthroughApi` documents the body as: "the model and the credentials
  // come from the profile in the path and must not be sent here". The gateway
  // does the opposite and demands `model`. Either the gateway should fall back to
  // the profile's model or the SDK text is wrong; if the docs get fixed instead,
  // replace this with a plain "model is required" 400 test.
  test.fail(
    "BUG XXXXX: POST chat/completions - the model is not taken from the profile although the SDK says it is",
    async ({ apiSdk, paymentsApi }) => {
      const { chatProfileId } = await providePassthrough(apiSdk, paymentsApi);

      const result = await postRaw(apiSdk, "owner", chatProfileId, "chat", {
        messages: [{ role: "user", content: "Reply with the word OK" }],
        max_tokens: 16,
      });

      expect(result.status).toBe(200);
    },
  );

  test.fail(
    "BUG XXXXX: POST images/generations - the model is not taken from the profile although the SDK says it is",
    async ({ apiSdk, paymentsApi }) => {
      const { imageProfileId } = await providePassthrough(apiSdk, paymentsApi);

      const result = await postRaw(apiSdk, "owner", imageProfileId, "images", {
        prompt: "a red circle",
      });

      expect(gatewayMessage(result)).not.toBe("model is required");
    },
  );
});
