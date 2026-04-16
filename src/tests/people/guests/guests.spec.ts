import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";

// approveGuestShareLink — requires browser session context (cookie set by frontend
// when opening external share link page), not possible to automate via API tests

test.describe("DELETE /people/guests - Delete guests", () => {
  test("DELETE /people/guests - Room admin removes guests from their list and they are excluded from the room", async ({
    apiSdk,
  }) => {
    // Create and authenticate RoomAdmin
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    // RoomAdmin creates two guests
    const { data: guest1Data } = await apiSdk.addMember("roomAdmin", "Guest");
    const { data: guest2Data } = await apiSdk.addMember("roomAdmin", "Guest");
    const guest1Id = guest1Data.response!.id!;
    const guest2Id = guest2Data.response!.id!;

    // RoomAdmin creates a room and invites both guests
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(10),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await roomAdminApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: guest1Id, access: FileShare.Read },
          { id: guest2Id, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    // RoomAdmin deletes both guests from their guest list
    const { status } = await roomAdminApi.guests.deleteGuests({
      updateMembersRequestDto: { userIds: [guest1Id, guest2Id] },
    });

    expect(status).toBe(200);

    // Verify guests are no longer in the room
    const { data: securityData } = await roomAdminApi.rooms.getRoomSecurityInfo(
      { id: roomId },
    );

    const memberIds =
      (securityData as any).response?.map((share: any) => share.sharedTo?.id) ??
      [];

    expect(memberIds).not.toContain(guest1Id);
    expect(memberIds).not.toContain(guest2Id);
  });

  test("DELETE /people/guests - Room admin removes a guest from their guest list", async ({
    apiSdk,
  }) => {
    // Create and authenticate RoomAdmin
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    // RoomAdmin creates a Guest — guest is in RoomAdmin's guest list
    const { data: guestData } = await apiSdk.addMember("roomAdmin", "Guest");
    const guestId = guestData.response!.id!;

    // RoomAdmin removes the guest from their guest list
    const { data, status } = await roomAdminApi.guests.deleteGuests({
      updateMembersRequestDto: { userIds: [guestId] },
    });
    console.log("deleteGuests response:", JSON.stringify(data, null, 2));

    expect(status).toBe(200);
  });
});
