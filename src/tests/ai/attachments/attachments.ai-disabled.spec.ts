import { expect } from "@playwright/test";
import { FileType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { setPortalAiAccess } from "@/src/helpers/ai-access";
import {
  configureAiToolsAsUnpaid,
  enableAiGateway,
} from "@/src/helpers/wallet-services";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import {
  AiAttachments,
  createThreadWithUserMessage,
} from "@/src/helpers/ai-attachments";

// /api/2.0/ai/attachments/* with the portal AI switch off
// (PUT /api/2.0/settings/ai-access, enabled: false).
//
// Re-measured on 2026-08-10, after the write side was reworked:
//
//   save-file            403
//   save-files-many      403
//   save-image           200
//   save-images-many     200
//   get                  403, consistently
//   get-many             403, consistently
//   link-to-message      403
//   delete               403
//   delete-many          403
//
// Three groups, and each is tested differently:
//
//   * The FILE half of the write side is now behind the switch and the IMAGE half
//     is not. Recorded as plain tests rather than as a defect: no requirement says
//     how far the switch reaches into /ai/attachments/*, and the split is the
//     thing to notice — a bug report needs that requirement first. (Until this
//     re-measurement all four save-* routes ignored the switch.)
//   * link-to-message, delete and delete-many honour it — but only once it has
//     propagated, and propagation is not instant: a 200 still slips through after
//     the first 403. `expectRefusedOnceSettled` waits for a short run of refusals
//     before requiring the rest of the calls to be refused too. The mutating
//     versions aim at a non-existent id, so the calls that slip through cannot
//     destroy a draft the test still needs.
//   * get and get-many used to answer both 200 and 403 for one unchanged portal
//     state, indefinitely. They now settle (BUG 82759, BUG 82766), and the two
//     tests that measured the disagreement assert consistency instead.
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

  test("POST /api/2.0/ai/attachments/save-file - the file routes are gated when AI access is disabled", async ({
    apiSdk,
  }) => {
    // This used to be the other way round — the whole store stayed open, on the
    // reading that filling a draft needs no model call. The file half is now
    // behind the switch and the image half is not, which is the split the batch
    // test below measures as well.
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

    // Uploaded while AI is still on, so the 403 below cannot be the upload.
    const path = String(
      await attachments.backingFileId(
        "owner",
        "Autotest off.docx",
        "created with AI off",
      ),
    );

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    const { status, error } = await attachments.saveFile("owner", {
      input: { path, content: "", type: FileType.Document },
    });

    expect(status).toBe(403);
    expect(error).toBe("Forbidden");
  });

  test("POST /api/2.0/ai/attachments/save-image - an image draft can still be created when AI access is disabled", async ({
    apiSdk,
  }) => {
    // BUG 83289 (open 2026-08-20): save-image answers 500 for everyone, which
    // this test's premise depends on. Remove once fixed.
    test.fail();

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

  test("POST /api/2.0/ai/attachments/save-files-many, save-images-many - only the file batch is gated when AI access is disabled", async ({
    apiSdk,
  }) => {
    // BUG 83289 (open 2026-08-20): save-images-many answers 500 for everyone,
    // which this test's premise depends on. Remove once fixed.
    test.fail();

    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

    const off = await setPortalAiAccess(ownerApi, false);
    expect(off.enabled).toBe(false);

    const path = String(
      await attachments.backingFileId("owner", "off-batch.docx", "x"),
    );
    const files = await attachments.saveFilesMany("owner", {
      inputs: [
        { path, title: "off-batch.docx", content: "", type: FileType.Document },
      ],
    });
    const images = await attachments.saveImagesMany("owner", {
      inputs: [{ name: "off-batch.png", base64: PNG_1X1 }],
    });

    // The two batch routes part ways under the switch: the file one is gated and
    // the image one is not. `save-file` and `save-image` are both still open (the
    // tests above), so this is not "batches are gated" either — it is one route.
    expect([files.status, images.status]).toEqual([403, 200]);
    expect(files.error).toBe("Forbidden");
    expect(images.data).toHaveLength(1);
  });

  test("BUG 82759: POST /api/2.0/ai/attachments/get - answers one status for one portal state", async ({
    apiSdk,
  }) => {
    // The claim was never "it should be 403". The scope of the switch is not
    // defined for the read routes, so either answer could be the intended one —
    // but not both, and `get` used to alternate indefinitely, so whether a draft
    // was readable on an AI-disabled portal was decided per request. Which of
    // the two it settled on is left to the assertion below rather than pinned
    // here, for the same reason.
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

    expect(
      new Set(statuses),
      `get answered ${statuses.join(",")} for one unchanged portal state`,
    ).toHaveProperty("size", 1);
  });

  test("BUG 82766: POST /api/2.0/ai/attachments/get-many - answers one status for one portal state", async ({
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

    expect(
      new Set(statuses),
      `get-many answered ${statuses.join(",")} for one unchanged portal state`,
    ).toHaveProperty("size", 1);
  });
});

// The other off-state: the portal AI switch is ON but the "AI Tools" wallet
// service was never paid for. It gates none of /ai/attachments/* — which is the
// same conclusion as for the save-* routes above, but for a different reason:
// the wallet only gates inference, so nothing in the attachment store is
// affected at all.
//
// One lifecycle test rather than a route-by-route sweep: what needs proving is
// that a draft can still be created, read, referenced and removed on an unpaid
// portal, and a chain shows that better than four isolated 200s. The bulk
// save-*-many routes are left to attachments.spec.ts — they share this
// controller and have not diverged from the single-item ones in any state.

test.describe("AI Attachments - AI Tools wallet service not paid for", () => {
  test("POST /api/2.0/ai/attachments/save-file, get, link-to-message, DELETE delete - the attachment lifecycle works with AI Tools unpaid", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await configureAiToolsAsUnpaid(ownerApi);

    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Unpaid Wallet Attachments Agent",
      profileId,
    });
    // `append-user-message` stores the carrier message without asking the model
    // anything, so this setup does not depend on the inference the unpaid state
    // blocks.
    const { threadId, messageId } = await createThreadWithUserMessage(
      aiChat,
      "owner",
      { profileId, agentId },
    );

    const draftId = await test.step("save-file", async () => {
      const path = String(
        await attachments.backingFileId(
          "owner",
          "Autotest unpaid-wallet.docx",
          "stored with AI Tools unpaid",
        ),
      );
      const { status, data } = await attachments.saveFile("owner", {
        input: { path, content: "", type: FileType.Document },
        entityId: String(agentId),
      });
      expect(status).toBe(200);
      expect(data?.id).toBeTruthy();
      return data!.id!;
    });

    await test.step("get", async () => {
      // Polled: reads are intermittent in every portal state (see the helper),
      // so a single empty read would say nothing about the wallet.
      const stored = await attachments.expectStored(
        "owner",
        draftId,
        "a draft stored with AI Tools unpaid",
      );
      expect(stored.content).toBe("stored with AI Tools unpaid");
    });

    await test.step("link-to-message", async () => {
      // Only the call being accepted is asserted. `link-to-message` answers
      // `{success:true}` without attaching anything in ANY portal state, so a
      // test claiming the draft ends up on the message would be wrong here for
      // reasons that have nothing to do with the wallet.
      const { status, data } = await attachments.linkToMessage("owner", {
        ids: [draftId],
        messageId,
        threadId,
      });
      expect(status).toBe(200);
      expect(data?.success).toBe(true);
    });

    await test.step("delete", async () => {
      const { status } = await attachments.deleteOne("owner", draftId);
      expect(status).toBe(200);
      // Repeated, because one delete is intermittent in every portal state.
      await attachments.purge("owner", draftId);
    });
  });
});
