import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

test.describe("Share link privacy - no user data leakage", () => {
  test.skip("BUG: External file share link response does not expose room creator and link creator data", async ({
    apiSdk,
    request,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    // Step 1: Owner creates a room and a file in it
    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Share Link Privacy Room",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile(roomId, {
      title: "Autotest Share Link Privacy File",
    });
    const fileId = fileData.response!.id!;

    // Step 2: Create a user (without authenticating) and invite to room as RoomManager
    // Important: addMember does NOT authenticate, so the owner's session stays clean
    const { data: memberData, userData: userInfo } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const userId = memberData.response!.id!;

    const { status: securityStatus } = await ownerApi.rooms.setRoomSecurity(
      roomId,
      {
        invitations: [{ id: userId, access: FileShare.RoomManager }],
        notify: false,
      },
    );

    expect(securityStatus).toBe(200);

    // Step 3: Authenticate the user and create an external share link
    const userApi = await apiSdk.authenticateMember(userInfo, "RoomAdmin");
    const portalDomain = apiSdk.tokenStore.portalDomain;

    // POST /api/2.0/files/file/:fileId/link
    const { data: linkData, status: linkStatus } =
      await userApi.files.createFilePrimaryExternalLink(fileId, {
        access: FileShare.Read,
      });

    expect(linkStatus).toBe(200);
    expect(linkData.statusCode).toBe(200);
    expect(linkData.response).toBeDefined();
    expect(linkData.response!.sharedLink).toBeDefined();
    const requestToken = linkData.response!.sharedLink!.requestToken!;

    // Step 4: Open the share link anonymously (simulates incognito browser)
    // Short link /s/<hash> redirects to /doceditor?share=<requestToken>&fileId=<fileId>
    const docEditorUrl = `https://${portalDomain}/doceditor?share=${requestToken}&fileId=${fileId}`;

    const response = await request.get(docEditorUrl);
    const responseBody = await response.text();

    // Step 5: Verify that the response does not contain any user PII
    // Bug: doceditor?share= response leaks Display name and Email
    // of room creator and link creator; @ in emails is encoded as %40
    const ownerEmail = config.DOCSPACE_OWNER_EMAIL;
    const userEmail = userInfo.email;
    const ownerEmailEncoded = ownerEmail.replace("@", "%40");
    const userEmailEncoded = userEmail.replace("@", "%40");

    // Room creator (owner) data must not be exposed
    expect(responseBody).not.toContain(ownerEmail);
    expect(responseBody).not.toContain(ownerEmailEncoded);
    expect(responseBody).not.toContain("admin-zero"); // owner display name

    // Link creator (user) data must not be exposed
    expect(responseBody).not.toContain(userEmail);
    expect(responseBody).not.toContain(userEmailEncoded);
    expect(responseBody).not.toContain(userInfo.firstName);
    expect(responseBody).not.toContain(userInfo.lastName);
  });
});
