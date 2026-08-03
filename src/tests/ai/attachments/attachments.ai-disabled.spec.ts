import { expect } from "@playwright/test";
import { FileType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import {
  AiAttachments,
  createThreadWithUserMessage,
} from "@/src/helpers/ai-attachments";

// /api/2.0/ai/attachments/* with the portal AI switch off
// (PUT /api/2.0/settings/ai-access, enabled: false).
//
// Measured on a live portal on 2026-08-03, ten calls per route after a warm-up
// that lets the setting propagate:
//
//   save-file            403 in  0/10
//   save-files-many      403 in  0/10
//   save-image           403 in  0/10
//   save-images-many     403 in  0/10
//   get                  403 in  8/10
//   get-many             403 in  5/10
//   link-to-message      403 in 10/10
//   delete               403 in 10/10
//   delete-many          403 in 10/10
//
// Three groups, and each is tested differently:
//
//   * The four save-* routes ignore the switch. Recorded as plain tests, NOT as
//     defects: storing a draft involves no model call, the composer fills the
//     store before any message is sent, and no requirement says the switch has to
//     cover all of /ai/attachments/*. A bug here needs that requirement first.
//   * link-to-message, delete and delete-many honour it — but only once it has
//     propagated, and propagation is not instant: a 200 still slips through after
//     the first 403. `expectRefusedOnceSettled` waits for a short run of refusals
//     before requiring the rest of the calls to be refused too. The mutating
//     versions aim at a non-existent id, so the calls that slip through cannot
//     destroy a draft the test still needs.
//   * get and get-many never settle: they keep answering both 200 and 403 for one
//     unchanged portal state. That is what those two tests assert — a
//     disagreement, not a particular status — because the intended scope of the
//     switch over the read routes is not defined anywhere, and either answer
//     could be the right one. Both cannot.
//
// setPortalAiAccess reads the flag back after writing it, so no test here can be
// green because the disable call quietly failed.
//
// Every bug test here is a plain `test()` that calls `test.fail()` immediately
// before its failing assertion — never the `test.fail(title, fn)` form, which
// would also swallow a broken setup.

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const MISSING_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

/**
 * Calls allowed while the flipped setting propagates. `setPortalAiAccess` already
 * reads the flag back, and the portal reports `enabled:false` while requests are
 * still being served — so the stored setting is not a usable readiness signal and
 * some polling is unavoidable.
 */
const SETTLE_ATTEMPTS = 12;

/**
 * Consecutive refusals that count as "the switch has taken effect". One is not
 * enough: a gated route still answered `403,200,403,403,…` mid-propagation. Three
 * in a row is a heuristic, not proof that every instance was reached — nothing
 * observable from the API can prove that.
 */
const SETTLE_STREAK = 3;

/** Calls required to stay refused afterwards. */
const REFUSED_ATTEMPTS = 12;

/** Calls used to judge whether a route answers one status or several. */
const CONSISTENCY_ATTEMPTS = 12;

/** Pause between polls, so a burst of identical requests is not hammered out. */
const POLL_INTERVAL_MS = 150;

async function collectStatuses(
  call: () => Promise<{ status: number }>,
  attempts: number,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    statuses.push((await call()).status);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return statuses;
}

/**
 * Asserts a route stays refused: polls until it has answered 403 SETTLE_STREAK
 * times in a row, then requires the next REFUSED_ATTEMPTS calls to be refused too.
 *
 * Both halves matter. Without the poll the propagation window alone fails the
 * test; without the run afterwards a route that refuses only half the calls would
 * look correctly gated.
 */
async function expectRefusedOnceSettled(
  call: () => Promise<{ status: number }>,
  label: string,
) {
  const seen: number[] = [];
  let streak = 0;
  for (
    let attempt = 0;
    attempt < SETTLE_ATTEMPTS && streak < SETTLE_STREAK;
    attempt++
  ) {
    const { status } = await call();
    seen.push(status);
    streak = status === 403 ? streak + 1 : 0;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  expect(
    streak,
    `${label} was never refused ${SETTLE_STREAK} times in a row within ${SETTLE_ATTEMPTS} calls: ${seen.join(",")}`,
  ).toBe(SETTLE_STREAK);

  const after = await collectStatuses(call, REFUSED_ATTEMPTS);
  expect(
    after.filter((status) => status !== 403),
    `${label} answered these once the refusal had settled: ${after.join(",")}`,
  ).toEqual([]);
}

test.describe("AI Attachments - AI access disabled", () => {
  test("POST /api/2.0/ai/attachments/link-to-message - returns 403 when AI access is disabled", async ({
    apiSdk,
    paymentsApi,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Attachments Agent",
      profileId,
    });
    const { threadId, messageId } = await createThreadWithUserMessage(
      aiChat,
      "owner",
      { profileId, agentId },
    );
    const draftId = await attachments.saveFileId("owner", {
      title: "Autotest before-off.docx",
      content: "x",
      type: FileType.Document,
    });

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.writeStatus).toBe(200);
    expect(off.enabled).toBe(false);

    await expectRefusedOnceSettled(
      () =>
        attachments.linkToMessage("owner", {
          ids: [draftId],
          messageId,
          threadId,
        }),
      "link-to-message",
    );
  });

  test("DELETE /api/2.0/ai/attachments/delete - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    // Aimed at an id that does not exist. The route answers `{success:true}` for
    // unknown ids just as it does for real ones, so the gate is measured exactly
    // the same way — but the calls that slip through during propagation cannot
    // destroy anything, which they would if a real draft were the target.
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const survivor = await attachments.saveFileId("owner", {
      title: "Autotest bystander.docx",
      content: "x",
      type: FileType.Document,
    });

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    await expectRefusedOnceSettled(
      () => attachments.deleteOne("owner", MISSING_ID),
      "delete",
    );

    // Turning the switch back on shows the refused calls left the real draft alone.
    const on = await setPortalAiAccess(ownerApi, true);
    expect(on.enabled).toBe(true);
    await attachments.expectStored(
      "owner",
      survivor,
      "a draft that was never targeted",
    );
  });

  test("DELETE /api/2.0/ai/attachments/delete-many - returns 403 when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    await expectRefusedOnceSettled(
      () => attachments.deleteMany("owner", [MISSING_ID]),
      "delete-many",
    );
  });

  test("POST /api/2.0/ai/attachments/save-file - Anonymous still gets 401 when AI access is disabled", async ({
    apiSdk,
  }) => {
    // The auth check runs before the AI gate, so turning the feature off does not
    // turn an unauthenticated 401 into a 403.
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    const { status } = await attachments.saveFile("anonymous", {
      input: { title: "anon.docx", content: "x", type: FileType.Document },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/ai/attachments/save-file - a draft can still be created when AI access is disabled", async ({
    apiSdk,
  }) => {
    // Recorded, not reported as a defect. Storing a draft needs no model call, and
    // the composer fills the store before a message is ever sent, so a switch that
    // only blocks *using* AI leaving this route open is a legitimate design. There
    // is no requirement stating the switch must cover all of /ai/attachments/*, so
    // there is nothing to file until one exists.
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    const { status, data } = await attachments.saveFile("owner", {
      input: {
        title: "Autotest off.docx",
        content: "created with AI off",
        type: FileType.Document,
      },
    });

    expect(status).toBe(200);
    expect(data?.id).toBeTruthy();
    // And it is really stored, not merely acknowledged.
    const stored = await attachments.expectStored(
      "owner",
      data!.id!,
      "a draft created with AI off",
    );
    expect(stored.content).toBe("created with AI off");
  });

  test("POST /api/2.0/ai/attachments/save-image - an image draft can still be created when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    const { status, data } = await attachments.saveImage("owner", {
      input: { name: "off.png", base64: PNG_1X1 },
    });

    expect(status).toBe(200);
    const stored = await attachments.expectStored(
      "owner",
      data!.id!,
      "an image draft created with AI off",
    );
    expect(stored.base64).toBe(PNG_1X1);
  });

  test("POST /api/2.0/ai/attachments/save-files-many - batches can still be stored when AI access is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    const files = await attachments.saveFilesMany("owner", {
      inputs: [
        { title: "off-batch.docx", content: "x", type: FileType.Document },
      ],
    });
    const images = await attachments.saveImagesMany("owner", {
      inputs: [{ name: "off-batch.png", base64: PNG_1X1 }],
    });

    expect([files.status, images.status]).toEqual([200, 200]);
    expect(files.data).toHaveLength(1);
    expect(images.data).toHaveLength(1);
  });

  test("BUG XXXXX: POST /api/2.0/ai/attachments/get - the same call answers both 200 and 403 for one portal state", async ({
    apiSdk,
  }) => {
    // This one is filed, and the claim is not "it should be 403". The scope of
    // the switch is not defined for the read routes, so either answer could be
    // the intended one — but not both. link-to-message, delete and delete-many
    // settle on 403; get keeps alternating indefinitely, so whether a draft is
    // readable on an AI-disabled portal is decided per request.
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const draftId = await attachments.saveFileId("owner", {
      title: "Autotest before-off.docx",
      content: "x",
      type: FileType.Document,
    });

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    const statuses = await collectStatuses(
      () => attachments.get("owner", draftId),
      CONSISTENCY_ATTEMPTS,
    );
    // The route answered at all, so the disagreement below is about the gate and
    // not about a dead endpoint.
    expect(statuses.some((status) => status === 200 || status === 403)).toBe(
      true,
    );

    test.fail();
    expect(
      new Set(statuses),
      `get answered ${statuses.join(",")} for one unchanged portal state`,
    ).toHaveProperty("size", 1);
  });

  test("BUG XXXXX: POST /api/2.0/ai/attachments/get-many - the same call answers both 200 and 403 for one portal state", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const draftId = await attachments.saveFileId("owner", {
      title: "Autotest before-off.docx",
      content: "x",
      type: FileType.Document,
    });

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    const statuses = await collectStatuses(
      () => attachments.getMany("owner", [draftId]),
      CONSISTENCY_ATTEMPTS,
    );
    expect(statuses.some((status) => status === 200 || status === 403)).toBe(
      true,
    );

    test.fail();
    expect(
      new Set(statuses),
      `get-many answered ${statuses.join(",")} for one unchanged portal state`,
    ).toHaveProperty("size", 1);
  });
});
