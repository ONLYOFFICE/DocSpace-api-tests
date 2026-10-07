import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { postRaw, providePassthrough } from "@/src/helpers/openai-passthrough";

// With portal AI access switched off the passthrough answers 403 for the Owner
// too. Each test proves a transition: the route answers what it should with AI on,
// the switch is flipped and read back, and only then is the 403 asserted — a bare
// 403 would also pass on an unprovisioned portal.
//
// The access guard runs BEFORE profile validation: an unknown profileId that
// answers 400 with AI on answers 403 with AI off.

test.describe("OpenAI passthrough - AI access disabled", () => {
  test("POST chat/completions - 200 with AI on, 403 with AI off, 200 again once it is back on", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );
    const ownerApi = apiSdk.forRole("owner");
    const body = {
      model: chatModel,
      max_tokens: 16,
      messages: [{ role: "user", content: "Reply with the word OK" }],
    };

    const before = await postRaw(apiSdk, "owner", chatProfileId, "chat", body);
    expect(before.status).toBe(200);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off).toMatchObject({ writeStatus: 200, enabled: false });

    const during = await postRaw(apiSdk, "owner", chatProfileId, "chat", body);
    expect(during.status).toBe(403);

    const on = await setPortalAiAccess(ownerApi, true);
    expect(on).toMatchObject({ writeStatus: 200, enabled: true });

    const after = await postRaw(apiSdk, "owner", chatProfileId, "chat", body);
    expect(after.status).toBe(200);
  });

  test("POST images/generations - the gateway answers with AI on, 403 with AI off", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatProfileId, chatModel } = await providePassthrough(
      apiSdk,
      paymentsApi,
    );
    const body = { model: chatModel, prompt: "a red circle" };

    // A text model: the gateway's own 400 shows the route is open without paying
    // for an image.
    const before = await postRaw(
      apiSdk,
      "owner",
      chatProfileId,
      "images",
      body,
    );
    expect(before.status).toBe(400);
    expect(before.data?.error?.code).toBe("gateway_error");

    const off = await setPortalAiAccess(apiSdk.forRole("owner"), false);
    expect(off).toMatchObject({ writeStatus: 200, enabled: false });

    const during = await postRaw(
      apiSdk,
      "owner",
      chatProfileId,
      "images",
      body,
    );
    expect(during.status).toBe(403);
  });

  test("POST chat/completions - an unknown profileId answers 400 with AI on and 403 with AI off", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const { chatModel } = await providePassthrough(apiSdk, paymentsApi);
    const body = {
      model: chatModel,
      messages: [{ role: "user", content: "hi" }],
    };

    const before = await postRaw(apiSdk, "owner", "999999", "chat", body);
    expect(before.status).toBe(400);

    const off = await setPortalAiAccess(apiSdk.forRole("owner"), false);
    expect(off).toMatchObject({ writeStatus: 200, enabled: false });

    const during = await postRaw(apiSdk, "owner", "999999", "chat", body);
    expect(during.status).toBe(403);
  });
});
