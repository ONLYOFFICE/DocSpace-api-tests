import { expect } from "@playwright/test";
import { FileShare, FileType, RoomType } from "@onlyoffice/docspace-api-sdk";
import { test } from "@/src/fixtures";
import { enableAiGateway } from "@/src/helpers/wallet-services";
import { expectDeviceFileStored } from "@/src/helpers/device-upload";
import { AiAgentChat, inviteToAgent } from "@/src/helpers/ai-agent-chat";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";
import {
  AiAttachments,
  PURGE_ROUNDS,
  READ_ATTEMPTS,
  createThreadWithUserMessage,
} from "@/src/helpers/ai-attachments";

// Permissions of /api/2.0/ai/attachments/*.
//
// This controller used to have no per-user scoping at all — measured 2026-08-03,
// an attachment id was a bearer token and any authenticated user could read
// another user's draft in full, including its `content`, and delete it. The
// tests in "cross-user access" are the reason this file exists.
//
// Re-measured 2026-08-17: the scoping landed, but only for FILE drafts. The
// split, from a probe that asked for the same two ids on both read routes:
//
//   * a file draft belonging to someone else resolves on neither `get` nor
//     `get-many`, in 14 polled attempts each — BUG 82765/82768/82769 closed, and
//     the six tests below that used to be `test.fail` now assert the rule;
//   * an IMAGE draft still resolves for another user, on both routes, and does
//     so intermittently, which is why polling is what catches it — BUG 82758 is
//     still open and is still a `test.fail` here. So the surviving hole is about
//     the KIND of draft, not about the route;
//   * a delete of somebody else's draft answers `200 {"success":true}` and does
//     not delete it. The refusal is silent, and indistinguishable from the
//     `success` an unknown id has always reported (attachments.spec.ts). Pinned
//     as observed rather than as a bug: from the caller's side a draft it may not
//     see is a draft that does not exist.
//
// A Guest is handled by a different mechanism than a User, and both halves of it
// look like collateral damage rather than the intent:
//
//   * `save-file` refuses a Guest outright, on a file the Guest can read. That is
//     the BUG XXXXX test in "who may create a draft".
//   * `get` and `get-many` answer a Guest 403 for ANY id, an unknown one included,
//     where the owner gets `200 [null]`. So a Guest cannot read a draft — not
//     somebody else's and not one of their own. It is not the AI stack shutting
//     Guests out in general: the same Guest reads `/ai/config`, `/ai/config/user`
//     and the agent list with 200.
//
// Both are why the Guest test below controls with the owner's own read rather than
// with a draft of the Guest's, and why it pins the 403 instead of a null in place.
//
// Two constraints shape how they are written:
//
//   * One authenticated member per test. `apiSdk.request` is a single context
//     whose session cookie beats the bearer token, so a second member in the
//     same test would hijack every later AI call. Owner-side setup therefore
//     happens BEFORE `addAuthenticatedMember`, and `apiSdk.authenticateOwner()`
//     is called before verifying anything as the owner afterwards.
//     Because that mechanism is easy to get wrong silently, every test whose
//     conclusion depends on *who* made the call pins it with `expectActingAs`
//     against `/people/@self` first. Without that, a missed re-authentication
//     turns "a member read the owner's draft" into the owner reading their own,
//     and the leak test goes green. The real fix is one request context per role
//     rather than one shared cookie, but that is a repository-wide change.
//   * Reads are polled and deletes are repeated. A draft is only visible to about
//     half of the reads that ask for it, and one delete does not reliably remove
//     it (see "intermittent reads and deletes" in attachments.spec.ts), so "the
//     other user could not read it" has to mean "not in N attempts" and "the other
//     user could not delete it" has to mean "not in N calls". Otherwise every leak
//     test here would pass by accident about half the time — which is exactly how
//     the surviving image leak still behaves.
//   * Every test that concludes "the other user got nothing" carries a positive
//     control that the caller can read, or delete, a draft of its own in the same
//     portal. Without it a dead endpoint or a lost session produces the same nulls
//     as a working access check, and the test passes for the wrong reason.
//
// Agent membership is not part of the picture: attachments are not scoped by
// agent either (`entityId` is accepted and never returned), so a member is
// invited below only where a test needs the member to own a thread.

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const MISSING_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

const MEMBER_TYPES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
  { type: "Guest", role: "guest" },
];

/**
 * The member types that have a Documents folder of their own to upload into. A
 * file draft is a reference to a stored file the caller can read, so a Guest —
 * who has no personal storage — needs a file shared with them instead, and is
 * covered by its own test below.
 */
const TYPES_WITH_STORAGE = MEMBER_TYPES.filter(
  (entry) => entry.type !== "Guest",
);

test.describe("AI Attachments - who may create a draft", () => {
  for (const { type, role } of TYPES_WITH_STORAGE) {
    test(`POST /api/2.0/ai/attachments/save-file - ${role} saves a file draft`, async ({
      apiSdk,
    }) => {
      // Not gated by user type, and not gated by agent membership either.
      //
      // The backing file is uploaded AS THE MEMBER, into their own Documents —
      // `save-file` resolves `path` against the caller's access, so an owner's
      // file would make this a test of the access check instead.
      const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
      await apiSdk.addAuthenticatedMember("owner", type);

      const path = String(
        await attachments.backingFileId(
          role,
          `Autotest ${role}.docx`,
          `saved by ${role}`,
        ),
      );
      const { status, data } = await attachments.saveFile(role, {
        input: { path, content: "", type: FileType.Document },
      });

      expect(status).toBe(200);
      expect(data?.id).toBeTruthy();
      await attachments.expectStored(role, data!.id!, `${role}'s own draft`);
    });
  }

  test("BUG XXXXX: POST /api/2.0/ai/attachments/save-file - a Guest attaches a file shared with them", async ({
    apiSdk,
  }) => {
    // A Guest has no Documents of their own, and a file draft has to reference a
    // file the caller can read, so the only file a Guest can attach is one shared
    // with them. This used to work — the room membership, not the user type, was
    // what made it possible.
    //
    // Since 2026-08-17 it is a bare `403 {"error":"Forbidden"}`, and the refusal
    // is about the user type rather than about access to the file: the Guest can
    // read the room and the file itself (asserted below), the owner attaches the
    // same file id at the same moment, a plain User with the same FileShare.Read
    // attaches a room file (attachments.spec.ts, "attaching by id is checked
    // against the caller's access to the file"), and `save-image` answered a Guest
    // 200 earlier the same day. A Guest who may open a document but may not attach
    // it to the chat in the same room is not a rule the product states anywhere.
    //
    // It does not stand alone either: the read routes refuse a Guest too (see the
    // note at the top of this file), so a Guest invited to an agent can chat but
    // can neither attach a file nor read back a draft. That is filed rather than
    // pinned because nothing in the product says a Guest may not use attachments.
    const ownerApi = apiSdk.forRole("owner");
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);

    const { data: room } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Guest Share Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = room.response!.id!;
    const shared = await expectDeviceFileStored(
      apiSdk,
      "owner",
      roomId,
      "Autotest shared.docx",
      Buffer.from("shared with a guest", "utf8"),
      "text/plain",
    );

    const { data: guestData, userData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const invited = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: guestData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });
    // The premise of the whole test: without the invite a 403 below would look
    // like a rule about Guests.
    expect(invited.status, "the owner shares the room with the Guest").toBe(
      200,
    );

    await apiSdk.authenticateMember(userData, "Guest");
    await attachments.expectActingAs(
      "guest",
      guestData.response!.id!,
      "the Guest",
    );

    // The premise, and the whole reason the 403 below is a bug rather than an
    // access check doing its job: the Guest really can read the file that is about
    // to be attached, through the ordinary files API.
    const fileRead = await attachments.rawRequest(
      "guest",
      "get",
      `/api/2.0/files/file/${shared.id}`,
    );
    expect(fileRead.status, "the Guest can read the shared file itself").toBe(
      200,
    );

    const { status, data } = await attachments.saveFile("guest", {
      input: {
        path: String(shared.id),
        content: "",
        type: FileType.Document,
      },
    });

    test.fail();
    expect(status, "a Guest attaching a file they can read").toBe(200);
    expect(data?.content, "the Guest gets the file's text").toBe(
      "shared with a guest",
    );
    await attachments.expectStored("guest", data!.id!, "the Guest's draft");
  });

  for (const { type, role } of MEMBER_TYPES) {
    test(`POST /api/2.0/ai/attachments/save-image - ${role} saves an image draft`, async ({
      apiSdk,
    }) => {
      const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
      await apiSdk.addAuthenticatedMember("owner", type);

      const { status, data } = await attachments.saveImage(role, {
        input: { name: `${role}.png`, base64: PNG_1X1 },
      });

      expect(status).toBe(200);
      expect(data?.id).toBeTruthy();
      await attachments.expectStored(role, data!.id!, `${role}'s own draft`);
    });
  }
});

test.describe("AI Attachments - anonymous access", () => {
  test("POST /api/2.0/ai/attachments/* - Anonymous gets 401 Unauthorized on every route", async ({
    apiSdk,
  }) => {
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const ownerDraft = await attachments.saveFileId("owner", {
      title: "Autotest anon target.docx",
      content: "x",
      type: FileType.Document,
    });

    const calls: Array<[string, Promise<{ status: number }>]> = [
      [
        "save-file",
        attachments.saveFile("anonymous", {
          input: { title: "anon.docx", content: "x", type: FileType.Document },
        }),
      ],
      [
        "save-files-many",
        attachments.saveFilesMany("anonymous", {
          inputs: [{ title: "anon.docx", content: "x" }],
        }),
      ],
      [
        "save-image",
        attachments.saveImage("anonymous", {
          input: { name: "anon.png", base64: PNG_1X1 },
        }),
      ],
      [
        "save-images-many",
        attachments.saveImagesMany("anonymous", {
          inputs: [{ name: "anon.png", base64: PNG_1X1 }],
        }),
      ],
      ["get", attachments.get("anonymous", ownerDraft)],
      ["get-many", attachments.getMany("anonymous", [ownerDraft])],
      [
        "link-to-message",
        attachments.linkToMessage("anonymous", {
          ids: [ownerDraft],
          messageId: MISSING_ID,
          threadId: MISSING_ID,
        }),
      ],
      ["delete", attachments.deleteOne("anonymous", ownerDraft)],
      ["delete-many", attachments.deleteMany("anonymous", [ownerDraft])],
    ];

    for (const [label, call] of calls) {
      const { status } = await call;
      expect(status, label).toBe(401);
    }

    // None of the refused calls touched the draft.
    await attachments.expectStored(
      "owner",
      ownerDraft,
      "the owner's draft after nine anonymous calls",
    );
  });
});

test.describe("AI Attachments - cross-user access", () => {
  test("BUG 82765: POST /api/2.0/ai/attachments/get-many - a User cannot read another user's file draft", async ({
    apiSdk,
  }) => {
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const secret = `OWNER-SECRET-${apiSdk.faker.generateString(8)}`;
    const ownerDraft = await attachments.saveFileId("owner", {
      title: "Autotest owner-secret.docx",
      content: secret,
      type: FileType.Document,
    });

    // Owner setup is complete before the member exists, so the session cookie
    // cannot hijack it.
    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    // And the read below really is the member's: without this the shared
    // context's cookie could be sending it as the owner, which would make the
    // leak look like ordinary self-access.
    await attachments.expectActingAs("user", memberData.response!.id!, "User");

    // Positive control first: the member's own draft resolves through the very
    // same call. Without it the null below could be a dead route, an empty store
    // or a lost session rather than an access decision.
    const memberDraft = await attachments.saveFileId("user", {
      title: "Autotest member-own.docx",
      content: "the caller's own",
      type: FileType.Document,
    });
    const own = await attachments.expectStored(
      "user",
      memberDraft,
      "the member's own draft",
    );
    expect(own.content, "the member reads its own payload").toBe(
      "the caller's own",
    );

    const leaked = await attachments.findAttachment("user", ownerDraft);

    // Report what leaked, not just that something did, if this ever regresses.
    if (leaked) {
      expect(leaked.content, "the leaked payload").toBe(secret);
      expect(leaked.title).toBe("Autotest owner-secret.docx");
    }

    expect(
      leaked,
      `another user's draft must not be readable in ${READ_ATTEMPTS} attempts`,
    ).toBeNull();
  });

  test("BUG 82768: DELETE /api/2.0/ai/attachments/delete - a User cannot delete another user's draft", async ({
    apiSdk,
  }) => {
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const ownerDraft = await attachments.saveFileId("owner", {
      title: "Autotest owner-victim.docx",
      content: "x",
      type: FileType.Document,
    });
    await attachments.expectStored(
      "owner",
      ownerDraft,
      "the owner's draft before the member exists",
    );

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await attachments.expectActingAs("user", memberData.response!.id!, "User");

    // Repeated because one delete used to be intermittent: a single
    // refused-looking outcome could just be the call that happened not to reach
    // the record, which would let this test pass without the request having been
    // denied.
    const statuses: number[] = [];
    for (let round = 0; round < PURGE_ROUNDS; round++) {
      statuses.push((await attachments.deleteOne("user", ownerDraft)).status);
    }
    // The refusal is silent — `200 {"success":true}`, the same answer an unknown
    // id gets. Pinned because a client cannot tell the two apart, and because a
    // future 403 here would be a change worth noticing.
    expect(
      statuses,
      "a refused delete still reports success on every round",
    ).toEqual(Array(PURGE_ROUNDS).fill(200));

    // Positive control: the member's delete calls do remove records, so the
    // survivor below is a refusal and not a dead route. Its own draft is created
    // and deleted with the same method, in the same session.
    const memberDraft = await attachments.saveFileId("user", {
      title: "Autotest member-victim.docx",
      content: "x",
      type: FileType.Document,
    });
    await attachments.expectStored(
      "user",
      memberDraft,
      "the member's own draft",
    );
    for (let round = 0; round < PURGE_ROUNDS; round++) {
      await attachments.deleteOne("user", memberDraft);
    }
    await attachments.expectAbsent(
      "user",
      memberDraft,
      "the member's own draft after its own delete",
    );

    // The side effect is what matters, so it is measured as the owner — and the
    // context really has been handed back to the owner, or "the draft is still
    // there" could just be the member reading it.
    await apiSdk.authenticateOwner();
    await attachments.expectNotActingAs(
      "owner",
      memberData.response!.id!,
      "the member",
    );
    const survivor = await attachments.findAttachment("owner", ownerDraft);

    expect(
      survivor,
      `the draft must survive deletion by another user (delete answered ${statuses.join(",")})`,
    ).not.toBeNull();
  });

  test("BUG 82765: POST /api/2.0/ai/attachments/get-many - a Guest cannot read the portal owner's file draft", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The sharpest form of the leak this closed: a Guest is the least privileged
    // principal there is, holds Read on a single agent, and used to resolve the
    // owner's draft through it.
    //
    // How it is closed for a Guest is not how it is closed for a User, and the
    // controls below say so rather than letting the title imply per-id scoping:
    // the read routes now answer a Guest 403 for ANY id, an id that exists
    // nowhere included, while the owner gets `200 [null]` for the same unknown id.
    // It is a gate on the user type, not a decision about this draft — and it is
    // not the AI stack refusing Guests in general, since the same Guest reads
    // `/ai/config`, `/ai/config/user` and the agent list with 200.
    const ownerApi = apiSdk.forRole("owner");
    await enableAiGateway(paymentsApi, ownerApi.payment);
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const aiChat = new AiAgentChat(apiSdk.request, apiSdk.tokenStore);

    const profileId = await aiChat.defaultProfileId("owner");
    const agentId = await aiChat.createAgentId("owner", {
      title: "Autotest Attachments Agent",
      profileId,
    });
    const secret = `OWNER-SECRET-${apiSdk.faker.generateString(8)}`;
    const ownerDraft = await attachments.saveFileId(
      "owner",
      {
        title: "Autotest guest-target.docx",
        content: secret,
        type: FileType.Document,
      },
      String(agentId),
    );

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    // Read is the highest access an agent room grants a Guest.
    await inviteToAgent(
      ownerApi.rooms,
      agentId,
      guestData.response!.id!,
      FileShare.Read,
    );
    await attachments.expectActingAs("guest", guestData.response!.id!, "Guest");

    const leaked = await attachments.findAttachment("guest", ownerDraft);

    // What the refusal is: a blanket 403 on the read route, identical for an id
    // that exists nowhere. Pinned, because it is the whole reason `leaked` is null
    // and because a later switch to `200 [null]` — the owner's answer for an
    // unknown id — would mean real per-id scoping had replaced the user-type gate.
    const asked = await attachments.getMany("guest", [ownerDraft]);
    expect(asked.status, "a Guest asking for the owner's draft").toBe(403);
    const askedUnknown = await attachments.getMany("guest", [MISSING_ID]);
    expect(
      askedUnknown.status,
      "a Guest asking for an id that exists nowhere — same answer",
    ).toBe(403);

    if (leaked) {
      expect(leaked.content, "the leaked payload").toBe(secret);
    }

    // Positive control: the draft is alive and readable for its owner at this very
    // moment, so the Guest's null is not a draft that was never stored. Measured
    // as the owner deliberately — a Guest cannot create a draft of their own to
    // control with any more (`save-file` refuses them, the BUG XXXXX test at the
    // top of this file), which rules out the usual own-draft control.
    await apiSdk.authenticateOwner();
    await attachments.expectNotActingAs(
      "owner",
      guestData.response!.id!,
      "the Guest",
    );
    const forItsOwner = await attachments.expectStored(
      "owner",
      ownerDraft,
      "the owner's draft, read by the owner",
    );
    expect(forItsOwner.content, "the owner still reads the payload").toBe(
      secret,
    );

    expect(
      leaked,
      `a Guest must not read the owner's draft in ${READ_ATTEMPTS} attempts`,
    ).toBeNull();
  });

  test("BUG 82774: POST /api/2.0/ai/attachments/link-to-message - the caller's access to the target thread is checked", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Scope of the claim: this is about the authorization decision only, because
    // nothing is ever actually linked (see attachments.spec.ts) — there is no
    // write to observe either way. What is measured is that a caller with no
    // access to the thread is refused, which used to be an unguarded 200.
    //
    // 403 rather than 404 on purpose: an id that exists nowhere answers 404 here,
    // so the two are distinguishable and only the "exists, but not yours" case is
    // this test's subject.
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
      { profileId, agentId, title: "Autotest owner-only thread" },
    );

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await attachments.expectActingAs("user", memberData.response!.id!, "User");
    // Deliberately NOT invited to the agent: the member cannot see the thread.
    const uninvited = await aiChat.getThread("user", threadId);
    expect(
      uninvited.status,
      "the member must not be able to read the thread it is about to link into",
    ).not.toBe(200);

    const memberDraft = await attachments.saveFileId("user", {
      title: "Autotest intruder.docx",
      content: "x",
      type: FileType.Document,
    });

    const { status } = await attachments.linkToMessage("user", {
      ids: [memberDraft],
      messageId,
      threadId,
    });

    expect(status, "linking into a thread the caller cannot read").toBe(403);
  });

  test("BUG 82758: POST /api/2.0/ai/attachments/get - a User reads another user's image draft including its payload", async ({
    apiSdk,
  }) => {
    // The part of the leak that is still open, and the axis is the KIND of draft,
    // not the route: the scoping that closed the tests above covers file drafts
    // only, and an image draft still resolves for another user on `get` AND on
    // `get-many`. Both are asked here for that reason — measuring only `get`
    // would leave "maybe the single-id route was simply forgotten" open, and it is
    // not that.
    //
    // The leaked field is the base64 payload rather than extracted text, and the
    // read is intermittent: a single call comes back null often enough that
    // without `findAttachment*`'s polling this test would flap green.
    //
    // Cannot run at all while `save-image` answers 500 (measured 2026-08-17,
    // owner included, `save-file` unaffected): the setup below has no draft to
    // make, so the failure is an error in setup rather than an expected failure.
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const ownerDraft = await attachments.saveImageId("owner", {
      name: "owner-private.png",
      base64: PNG_1X1,
      title: "Autotest owner-private.png",
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await attachments.expectActingAs("user", memberData.response!.id!, "User");

    // Positive control: the member can read a draft of its own, so a null in
    // either position below would be an access decision and not a dead store.
    const memberDraft = await attachments.saveImageId("user", {
      name: "member-own.png",
      base64: PNG_1X1,
    });
    await attachments.expectStored(
      "user",
      memberDraft,
      "the member's own image draft",
    );

    const leaked = await attachments.findAttachmentViaGet("user", ownerDraft);
    const leakedViaMany = await attachments.findAttachment("user", ownerDraft);
    if (leaked) {
      expect(leaked.base64, "the leaked image payload").toBe(PNG_1X1);
    }

    test.fail();
    expect(
      { get: leaked, getMany: leakedViaMany },
      "another user's image draft must not be readable through either route",
    ).toEqual({ get: null, getMany: null });
  });

  test("BUG 82765: POST /api/2.0/ai/attachments/get-many - a mixed batch returns the caller's own draft and null for another user's", async ({
    apiSdk,
  }) => {
    // The batch form, and the shape a real client would hit: the caller asks for
    // its own id and someone else's in one call. It used to get both; it now gets
    // its own and a null in place, with the batch still 200 and both positions
    // kept — a refused id is reported exactly like an unknown one.
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const secret = `OWNER-SECRET-${apiSdk.faker.generateString(8)}`;
    const ownerDraft = await attachments.saveFileId("owner", {
      title: "Autotest mixed-owner.docx",
      content: secret,
      type: FileType.Document,
    });

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await attachments.expectActingAs("user", memberData.response!.id!, "User");
    const memberDraft = await attachments.saveFileId("user", {
      title: "Autotest mixed-member.docx",
      content: "the caller's own",
      type: FileType.Document,
    });

    // Asking once is not enough and stopping at the first call that resolves the
    // caller's own draft is not either: a draft is intermittently unreadable, so a
    // single call can show a null in the foreign position for reasons that have
    // nothing to do with authorization — and, the other way round, one lucky call
    // is all a surviving leak needs. Every attempt is made, and the question is
    // whether the foreign payload came back on ANY of them.
    let ownResolved = 0;
    let leaks = 0;
    for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
      const { status, data } = await attachments.getMany("user", [
        memberDraft,
        ownerDraft,
      ]);
      expect(status).toBe(200);
      expect(data, "the batch keeps both positions").toHaveLength(2);
      if (data![0]) {
        ownResolved++;
      }
      if (data![1]) {
        leaks++;
        // Report what leaked, not just that something did.
        expect(data![1]!.content, "the leaked payload").toBe(secret);
      }
    }
    // The caller could read its own draft, so a null in the other position is a
    // decision about the id and not a dead endpoint.
    expect(
      ownResolved,
      "calls in which the caller's own draft resolved",
    ).toBeGreaterThan(0);

    expect(
      leaks,
      `calls out of ${READ_ATTEMPTS} that returned the other user's draft`,
    ).toBe(0);
  });

  test("BUG 82769: DELETE /api/2.0/ai/attachments/delete-many - a mixed batch deletes only the caller's own draft", async ({
    apiSdk,
  }) => {
    // delete-many is a separate route from delete, and this is the form that used
    // to do real damage: one batch containing somebody else's id. The batch is
    // still accepted whole and still reports success — what changed is that the
    // foreign id in it is now a no-op while the caller's own id in the same batch
    // is deleted, which is also this test's positive control.
    const attachments = new AiAttachments(apiSdk.request, apiSdk.tokenStore);
    const ownerDraft = await attachments.saveFileId("owner", {
      title: "Autotest batch-victim.docx",
      content: "x",
      type: FileType.Document,
    });
    await attachments.expectStored(
      "owner",
      ownerDraft,
      "the owner's draft before the member exists",
    );

    const { data: memberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await attachments.expectActingAs("user", memberData.response!.id!, "User");
    const memberDraft = await attachments.saveFileId("user", {
      title: "Autotest batch-own.docx",
      content: "x",
      type: FileType.Document,
    });

    const statuses: number[] = [];
    for (let round = 0; round < PURGE_ROUNDS; round++) {
      statuses.push(
        (await attachments.deleteMany("user", [memberDraft, ownerDraft]))
          .status,
      );
    }
    expect(statuses, "the mixed batch is accepted on every round").toEqual(
      Array(PURGE_ROUNDS).fill(200),
    );

    // Positive control, and the reason the survivor below is a refusal: the very
    // same batches did delete the caller's own id.
    await attachments.expectAbsent(
      "user",
      memberDraft,
      "the caller's own draft in the mixed batch",
    );

    await apiSdk.authenticateOwner();
    await attachments.expectNotActingAs(
      "owner",
      memberData.response!.id!,
      "the member",
    );
    const survivor = await attachments.findAttachment("owner", ownerDraft);

    expect(
      survivor,
      `the draft must survive another user's batch delete (which answered ${statuses.join(",")})`,
    ).not.toBeNull();
  });
});
