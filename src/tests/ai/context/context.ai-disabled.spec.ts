import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { RoomType } from "@onlyoffice/docspace-api-sdk";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  AiContext,
  createTypedRoom,
  knowledgeRoomIds,
  roomTitle,
} from "@/src/helpers/ai-context";
import { enableAiGateway } from "@/src/helpers/wallet-services";

// Both context routes with the portal AI switch (PUT /settings/ai-access) off.
//
// Each test proves a transition: the route answers with the room first, the
// switch is flipped and read back, and only then is the off-state measured. A
// bare "after the flip" assertion would also pass on a portal where the switch
// never moved.

test.describe("GET /ai/context - AI access disabled", () => {
  test("GET /ai/context/get-knowledge-folders - answer with AI access switched off", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const context = new AiContext(apiSdk.request, apiSdk.tokenStore);
    const id = await createTypedRoom(
      apiSdk,
      roomTitle(apiSdk),
      RoomType.KnowledgeRoom,
    );
    const before = await context.getKnowledgeFolders("owner");
    expect(before.status).toBe(200);
    expect(knowledgeRoomIds(before.data)).toEqual([String(id)]);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.writeStatus, "PUT /settings/ai-access {enabled:false}").toBe(
      200,
    );
    expect(off.enabled, "ai-access read back after disabling").toBe(false);

    const { status, text } = await context.getKnowledgeFolders("owner");

    expect(status).toBe(403);
    expect(text, "the refusal carries no room data").not.toContain(String(id));

    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled, "ai-access read back after re-enabling").toBe(true);
    const restored = await context.getKnowledgeFolders("owner");
    expect(restored.status).toBe(200);
    expect(knowledgeRoomIds(restored.data)).toEqual([String(id)]);
  });

  test("GET /ai/context/get-context-folders - answer with AI access switched off", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const context = new AiContext(apiSdk.request, apiSdk.tokenStore);
    expect((await context.getContextFolders("owner")).status).toBe(200);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled, "ai-access read back after disabling").toBe(false);

    const { status } = await context.getContextFolders("owner");

    expect(status).toBe(403);
  });
});
