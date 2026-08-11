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
// The headline result, measured on a live portal on 2026-08-03: there is no
// per-user scoping on this controller at all. An attachment id is a bearer
// token. Any authenticated user — a plain User, a Guest with nothing but Read on
// one agent — can read another user's draft in full, including its `content`,
// and can delete it. The four tests in "cross-user access" pin that; they are
// the reason this file exists.
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
//     test here would pass by accident about half the time.
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

  test("POST /api/2.0/ai/attachments/save-file - a Guest attaches a file shared with them", async ({
    apiSdk,
  }) => {
    // A Guest is not refused by user type — but they have no Documents of their
    // own, and a file draft has to reference a file the caller can read. So the
    // only file a Guest can attach is one shared with them, and that is what this
    // measures: the room membership, not the user type, is what makes it possible.
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

    const { status, data } = await attachments.saveFile("guest", {
      input: {
        path: String(shared.id),
        content: "",
        type: FileType.Document,
      },
    });

    expect(status).toBe(200);
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
  test("BUG 82765: POST /api/2.0/ai/attachments/get-many - a User reads another user's draft in full", async ({
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

    const leaked = await attachments.findAttachment("user", ownerDraft);

    // Report what leaked, not just that something did.
    if (leaked) {
      expect(leaked.content, "the leaked payload").toBe(secret);
      expect(leaked.title).toBe("Autotest owner-secret.docx");
    }

    test.fail();
    expect(leaked, "another user's draft must not be readable").toBeNull();
  });

  test("BUG 82768: DELETE /api/2.0/ai/attachments/delete - a User deletes another user's draft", async ({
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

    // Repeated because one delete is intermittent: a single refused-looking
    // outcome could just be the call that happened not to reach the record,
    // which would let this test pass without the request having been denied.
    const statuses: number[] = [];
    for (let round = 0; round < PURGE_ROUNDS; round++) {
      statuses.push((await attachments.deleteOne("user", ownerDraft)).status);
    }

    // The side effect is what matters, so it is measured as the owner before
    // any status is asserted — and the context really has been handed back to
    // the owner, or "the draft is gone" could just be the member reading it.
    await apiSdk.authenticateOwner();
    await attachments.expectNotActingAs(
      "owner",
      memberData.response!.id!,
      "the member",
    );
    const survivor = await attachments.findAttachment("owner", ownerDraft);

    test.fail();
    expect(
      survivor,
      `the draft must survive deletion by another user (delete answered ${statuses.join(",")})`,
    ).not.toBeNull();
  });

  test("BUG 82765: POST /api/2.0/ai/attachments/get-many - a Guest reads the portal owner's draft", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // The sharpest form: a Guest is the least privileged principal there is,
    // holds Read on a single agent, and still resolves the owner's draft.
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
    if (leaked) {
      expect(leaked.content, "the leaked payload").toBe(secret);
    }

    test.fail();
    expect(leaked, "a Guest must not read the owner's draft").toBeNull();
  });

  test("BUG 82774: POST /api/2.0/ai/attachments/link-to-message - the caller's access to the target thread is not checked", async ({
    apiSdk,
    paymentsApi,
  }) => {
    // Scope of the claim: this is about the authorization decision only. It does
    // NOT show that a draft was written into someone else's thread — nothing is
    // ever actually linked (see attachments.spec.ts), so there is no confirmed
    // write. What is confirmed is that a caller with no access to the thread is
    // not refused, which is broken access control on the decision even while the
    // second defect keeps it from having an effect.
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

    test.fail();
    expect(status, "linking into a thread the caller cannot read").toBe(403);
  });

  test("BUG 82758: POST /api/2.0/ai/attachments/get - a User reads another user's image draft including its payload", async ({
    apiSdk,
  }) => {
    // Same defect through the single-id route and for the image kind, where the
    // leaked field is the base64 payload rather than extracted text.
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

    const leaked = await attachments.findAttachmentViaGet("user", ownerDraft);
    if (leaked) {
      expect(leaked.base64, "the leaked image payload").toBe(PNG_1X1);
    }

    test.fail();
    expect(
      leaked,
      "another user's image draft must not be readable",
    ).toBeNull();
  });

  test("BUG 82765: POST /api/2.0/ai/attachments/get-many - a mixed batch returns another user's draft alongside the caller's own", async ({
    apiSdk,
  }) => {
    // The batch form of the leak, and the shape a real client would hit: the
    // caller asks for its own id and someone else's in one call, and gets both.
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
    // caller's own draft is not either: the foreign draft is intermittently
    // unreadable, so a single call can show a null in its position for reasons
    // that have nothing to do with authorization. Every attempt is made, and the
    // question is whether the foreign payload came back on ANY of them.
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

    test.fail();
    expect(
      leaks,
      `calls out of ${READ_ATTEMPTS} that returned the other user's draft`,
    ).toBe(0);
  });

  test("BUG 82769: DELETE /api/2.0/ai/attachments/delete-many - a mixed batch deletes another user's draft", async ({
    apiSdk,
  }) => {
    // delete-many is a separate route from delete, and this is the form that
    // does real damage: one batch containing somebody else's id.
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

    await apiSdk.authenticateOwner();
    await attachments.expectNotActingAs(
      "owner",
      memberData.response!.id!,
      "the member",
    );
    const survivor = await attachments.findAttachment("owner", ownerDraft);

    test.fail();
    expect(
      survivor,
      `the draft must survive another user's batch delete (which answered ${statuses.join(",")})`,
    ).not.toBeNull();
  });
});
