import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";
import { AiSettings } from "@/src/helpers/ai-settings";
import { AgentRole } from "@/src/helpers/ai-http";
import { UserType } from "@/src/services/api-sdk";
import {
  listFolderFiles,
  waitForStableFolderFiles,
  waitForExportToSettle,
  waitForExportedFile,
} from "@/src/helpers/text-to-docx";

// Permissions of `POST /api/2.0/ai/text-to-docx`, the endpoint that replaced the
// removed `POST /ai/messages/{messageId}/export` (404, as is
// `POST /ai/chats/{chatId}/messages/export`). The old suite here drove the
// removed chat surface and tracked BUG 80770 (export without agent membership),
// BUG 80772 (export as a Viewer) and BUG 80779 (messageId 0 / -1); none of them
// can be re-checked, because the new endpoint takes no message and no agent.
//
// The one rule this endpoint enforces, verified against a live portal on
// 2026-07-31: the caller must be able to create files in the target folder.
// Nothing else matters — not the user type, not who owns the portal:
//
//   * DocSpaceAdmin, RoomAdmin and User all get 202 for their own My Documents.
//   * a Guest, who has no My Documents at all, gets 202 for a room where they
//     hold Content Creator — and that one is a defect rather than the contract.
//     A Guest has no access to the AI stack (how BUG 83237 was resolved), so
//     "the caller may create files here" must not be the whole check for them.
//     See the last test of the target-folder block.
//   * the Owner gets 403 for another user's My Documents, and so does a
//     DocSpaceAdmin.
//   * a room member with Viewer or Editor access gets 403, exactly as
//     `POST /files/{folderId}/file` does for them.
//
// Which is why no test here exports into a folder the caller does not own: a 403
// on someone else's My Documents says nothing about the caller's user type.
//
// One role per test on purpose — `apiSdk.request` is a single context whose
// session cookie beats the bearer token, so a second authenticated member in the
// same test would hijack every later AI call.
//
// That caveat applies to the AI calls only. State is read back through the SDK
// clients, and those go through an axios adapter that sends `Cookie: ""` on every
// request (src/utils/playwright-axios-adapter.ts:102), so `ownerApi` and
// `memberApi` keep acting as the role their bearer token belongs to no matter
// whose session the shared context is currently holding. Every "nothing was
// created" assertion below is still written against a folder that holds a known
// control file, so a listing the caller could not read would fail the test
// instead of looking like an empty folder — and `listFolderFiles` throws on a
// non-200 read for the same reason.

const MEMBER_TYPES: Array<{ type: UserType; role: AgentRole }> = [
  { type: "DocSpaceAdmin", role: "docSpaceAdmin" },
  { type: "RoomAdmin", role: "roomAdmin" },
  { type: "User", role: "user" },
];

test.describe("AI Messages - text-to-docx own-folder permissions", () => {
  for (const { type, role } of MEMBER_TYPES) {
    test(`POST /api/2.0/ai/text-to-docx - ${role} exports into their own My Documents`, async ({
      apiSdk,
    }) => {
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

      const { api: memberApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        type,
      );

      // The member's own folder, not the Owner's: writing into the Owner's My
      // Documents is refused for everyone, so it cannot show whether the user
      // type is allowed to call the endpoint at all.
      const { data: myFolder } = await memberApi.folders.getMyFolder({});
      const folderId = myFolder.response!.current!.id!;

      const title = `Exported ${apiSdk.faker.generateString(8)}`;
      const { data, status } = await aiSettings.textToDocx(role, {
        title,
        content: "The assistant said hello.",
        folderId,
      });
      expect(status).toBe(202);
      expect(data?.success).toBe(true);

      const exported = await waitForExportedFile(
        memberApi,
        folderId,
        `${title}.docx`,
      );
      expect(
        exported,
        `no "${title}.docx" in the ${role}'s My Documents`,
      ).toBeDefined();
      expect(exported!.fileExst).toBe(".docx");
    });
  }

  test("GET /api/2.0/files/@my - a Guest has no My Documents to export into", async ({
    apiSdk,
  }) => {
    // Pinned because it is the reason the Guest case has to go through a room:
    // there is no personal folder to aim a Guest export at.
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.folders.getMyFolder({});

    expect(status).toBe(404);
  });
});

test.describe("AI Messages - text-to-docx target folder permissions", () => {
  // Access levels that do not carry "create a file in this room". The export is
  // refused for exactly the same set, which is the evidence that the endpoint
  // defers to the folder's permissions instead of checking the user type.
  for (const { label, access } of [
    { label: "Viewer", access: FileShare.Read },
    { label: "Editor", access: FileShare.Editing },
  ]) {
    test(`POST /api/2.0/ai/text-to-docx - a room member with ${label} access cannot export into the room`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest TextToDocx Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      // A file the member is allowed to see, so the check at the end is "the
      // room still holds exactly this" rather than "the listing was empty",
      // which is also what an unreadable room would look like.
      const { data: control } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Control" },
      });
      const controlId = control.response!.id!;

      const { data: memberData, userData } = await apiSdk.addMember(
        "owner",
        "User",
      );
      const { status: shareStatus } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: memberData.response!.id!, access }],
          notify: false,
        },
      });
      expect(shareStatus).toBe(200);

      const memberApi = await apiSdk.authenticateMember(userData, "User");

      // Reference behaviour: this access level cannot create a file in the room
      // through the files API either.
      const { status: createStatus } = await memberApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Direct Create" },
      });
      expect(createStatus).toBe(403);

      const title = `Exported ${apiSdk.faker.generateString(8)}`;
      const { status, error } = await aiSettings.textToDocx("user", {
        title,
        content: "hello",
        folderId: roomId,
      });

      await waitForExportToSettle();
      expect(
        (await listFolderFiles(memberApi, roomId)).map((f) => f.id),
      ).toEqual([controlId]);
      expect(error).toBe("Forbidden");
      expect(status).toBe(403);
    });
  }

  // Access levels that do carry it. RoomManager is granted to a RoomAdmin
  // because a User or a Guest cannot hold it. A Guest holding the same
  // ContentCreator access is NOT here: the export works for them too, and that is
  // the defect at the end of this block rather than a row of this matrix.
  for (const { label, access, type, role } of [
    {
      label: "ContentCreator",
      access: FileShare.ContentCreator,
      type: "User",
      role: "user",
    },
    {
      label: "RoomManager",
      access: FileShare.RoomManager,
      type: "RoomAdmin",
      role: "roomAdmin",
    },
  ] as Array<{
    label: string;
    access: FileShare;
    type: UserType;
    role: AgentRole;
  }>) {
    test(`POST /api/2.0/ai/text-to-docx - a ${type} with ${label} access exports into someone else's room`, async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");
      const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest TextToDocx Room",
          roomType: RoomType.CustomRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: memberData, userData } = await apiSdk.addMember(
        "owner",
        type,
      );
      const { status: shareStatus } = await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: memberData.response!.id!, access }],
          notify: false,
        },
      });
      expect(shareStatus).toBe(200);

      const memberApi = await apiSdk.authenticateMember(userData, type);

      const title = `Exported ${apiSdk.faker.generateString(8)}`;
      const { status } = await aiSettings.textToDocx(role, {
        title,
        content: "The assistant said hello.",
        folderId: roomId,
      });
      expect(status).toBe(202);

      // The room belongs to the Owner, so this also shows the export is not
      // limited to folders the caller owns.
      const exported = await waitForExportedFile(
        memberApi,
        roomId,
        `${title}.docx`,
      );
      expect(exported, `no "${title}.docx" in the room`).toBeDefined();
    });
  }

  test("BUG 83256: POST /api/2.0/ai/text-to-docx - a Guest with Content Creator access exports a document", async ({
    apiSdk,
  }) => {
    // The one AI feature a Guest can actually use. The endpoint checks "may the
    // caller create files in this folder" and nothing else, so a Guest holding
    // Content Creator passes it, gets a 202, and the .docx really lands in the
    // room — measured 2026-08-19, and it is filed under the Guest's own name (see
    // the author test below for how that is established for a User).
    //
    // A Guest is refused everywhere else on the surface this endpoint belongs to:
    // they cannot open a thread, send a message, attach a file or read a prompt.
    // Exporting an assistant answer into a room is the same feature seen from its
    // other end.
    //
    // The room listing comes before the status, and both are written as the
    // contract a fix produces: the two files the Guest is allowed to have there and
    // no third one, plus the 403.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TextToDocx Guest Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    // Same purpose as in the refusal tests above: a file the Guest may see, so the
    // listing at the end cannot be confused with a room they could not read.
    const { data: control } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Control" },
    });
    const controlId = control.response!.id!;

    const { data: guestData, userData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const { status: shareStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          {
            id: guestData.response!.id!,
            access: FileShare.ContentCreator,
          },
        ],
        notify: false,
      },
    });
    expect(shareStatus).toBe(200);

    const guestApi = await apiSdk.authenticateMember(userData, "Guest");

    // The premise: this Guest really may create files here, so the 403 a fix
    // brings can only be about the user type — and it is what makes the export's
    // own check pass today.
    const { status: createStatus, data: direct } =
      await guestApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Direct Create" },
      });
    expect(createStatus, "the Guest may create files in the room").toBe(200);
    const directId = direct.response!.id!;

    const title = `Exported ${apiSdk.faker.generateString(8)}`;
    const { status } = await aiSettings.textToDocx("guest", {
      title,
      content: "The assistant said hello.",
      folderId: roomId,
    });

    await waitForExportToSettle();
    const ids = (await listFolderFiles(guestApi, roomId))
      .map((file) => file.id)
      .sort((a, b) => a - b);

    test.fail();
    expect(
      ids,
      `a Guest must not have exported "${title}.docx" into the room`,
    ).toEqual([controlId, directId].sort((a, b) => a - b));
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/text-to-docx - the saved document is authored by the caller, not by the room owner", async ({
    apiSdk,
  }) => {
    // The document is built by a background job, and whoever it is filed under
    // is who owns it afterwards: the author is what "My documents" filters on,
    // what the activity feed shows, and — in a room where a user may only touch
    // their own files — what decides whether they can open the answer they just
    // saved. A job that credited the room owner, or a system account, would be
    // invisible in every other test here, because all of them only ask whether
    // the file exists.
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TextToDocx Author Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: memberData, userData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const memberId = memberData.response!.id!;
    const { status: shareStatus } = await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberId, access: FileShare.ContentCreator }],
        notify: false,
      },
    });
    expect(shareStatus).toBe(200);

    const memberApi = await apiSdk.authenticateMember(userData, "User");

    const title = `Exported ${apiSdk.faker.generateString(8)}`;
    const { status } = await aiSettings.textToDocx("user", {
      title,
      content: "The assistant said hello.",
      folderId: roomId,
    });
    expect(status).toBe(202);

    const exported = await waitForExportedFile(
      memberApi,
      roomId,
      `${title}.docx`,
    );
    expect(exported, `no "${title}.docx" in the room`).toBeDefined();

    const { data: info, status: infoStatus } =
      await memberApi.files.getFileInfo({ fileId: exported!.id });
    expect(infoStatus).toBe(200);
    expect(info.response?.createdBy?.id).toBe(memberId);
  });

  test("POST /api/2.0/ai/text-to-docx - a member cannot export into the Owner's My Documents", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const ownerFolderId = myFolder.response!.current!.id!;
    const before = (
      await waitForStableFolderFiles(ownerApi, ownerFolderId)
    ).map((file) => file.id);
    // The sample documents make this a positive control: an empty baseline would
    // mean the folder was not really read as its owner.
    expect(before.length).toBeGreaterThan(0);

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status, error } = await aiSettings.textToDocx("user", {
      title: `Exported ${apiSdk.faker.generateString(8)}`,
      content: "hello",
      folderId: ownerFolderId,
    });

    await waitForExportToSettle();
    const after = (await listFolderFiles(ownerApi, ownerFolderId)).map(
      (file) => file.id,
    );
    expect(after.sort()).toEqual(before.sort());
    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/text-to-docx - the Owner cannot export into a member's My Documents", async ({
    apiSdk,
  }) => {
    // The portal Owner has no special standing here either.
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { api: memberApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data: memberFolder } = await memberApi.folders.getMyFolder({});
    const memberFolderId = memberFolder.response!.current!.id!;
    const before = (
      await waitForStableFolderFiles(memberApi, memberFolderId)
    ).map((file) => file.id);
    expect(before.length).toBeGreaterThan(0);

    // The shared request context now carries the member's session, so the Owner
    // has to take it back before the export runs as the Owner.
    await apiSdk.authenticateOwner();

    const { status, error } = await aiSettings.textToDocx("owner", {
      title: `Exported ${apiSdk.faker.generateString(8)}`,
      content: "hello",
      folderId: memberFolderId,
    });

    await waitForExportToSettle();
    const after = (await listFolderFiles(memberApi, memberFolderId)).map(
      (file) => file.id,
    );
    expect(after.sort()).toEqual(before.sort());
    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/text-to-docx - a DocSpaceAdmin cannot export into a member's My Documents", async ({
    apiSdk,
  }) => {
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    // Both members are created before either is authenticated: adding a member
    // while a member's session is current answers 403.
    const { userData: adminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { userData: memberUserData } = await apiSdk.addMember(
      "owner",
      "User",
    );

    const memberApi = await apiSdk.authenticateMember(memberUserData, "User");
    const { data: memberFolder } = await memberApi.folders.getMyFolder({});
    const memberFolderId = memberFolder.response!.current!.id!;
    const before = (
      await waitForStableFolderFiles(memberApi, memberFolderId)
    ).map((file) => file.id);
    expect(before.length).toBeGreaterThan(0);

    await apiSdk.authenticateMember(adminUserData, "DocSpaceAdmin");

    const { status, error } = await aiSettings.textToDocx("docSpaceAdmin", {
      title: `Exported ${apiSdk.faker.generateString(8)}`,
      content: "hello",
      folderId: memberFolderId,
    });

    await waitForExportToSettle();
    const after = (await listFolderFiles(memberApi, memberFolderId)).map(
      (file) => file.id,
    );
    expect(after.sort()).toEqual(before.sort());
    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/text-to-docx - a non-member cannot export into a room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest TextToDocx Closed Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: control } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Control" },
    });
    const controlId = control.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { status, error } = await aiSettings.textToDocx("user", {
      title: `Exported ${apiSdk.faker.generateString(8)}`,
      content: "hello",
      folderId: roomId,
    });

    // An invisible room is refused, not hidden behind a 404. The room is read
    // back as the Owner — the member cannot see it at all, so only the Owner's
    // listing can say whether anything was created.
    await waitForExportToSettle();
    expect((await listFolderFiles(ownerApi, roomId)).map((f) => f.id)).toEqual([
      controlId,
    ]);
    expect(error).toBe("Forbidden");
    expect(status).toBe(403);
  });

  test("POST /api/2.0/ai/text-to-docx - Anonymous gets 401 Unauthorized", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const aiSettings = new AiSettings(apiSdk.request, apiSdk.tokenStore);

    const { data: myFolder } = await ownerApi.folders.getMyFolder({});
    const folderId = myFolder.response!.current!.id!;

    const { status, error } = await aiSettings.textToDocx("anonymous", {
      title: `Exported ${apiSdk.faker.generateString(8)}`,
      content: "hello",
      folderId,
    });

    expect(error).toBe("Unauthorized");
    expect(status).toBe(401);
  });
});
