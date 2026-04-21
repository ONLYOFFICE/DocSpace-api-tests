import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("Portal Guests — Sharing Link — Permissions", () => {
  test.fail(
    "BUG : GET /api/2.0/people/guests/{userid}/share - Room admin cannot get sharing link for a guest created by Owner",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      const { data: guestData } = await apiSdk.addMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      const { data, status } = await apiSdk
        .forRole("roomAdmin")
        .portalGuests.getGuestSharingLink({ userid: guestId });

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    },
  );

  test("GET /api/2.0/people/guests/{userid}/share - User cannot get sharing link for a guest created by Owner", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .portalGuests.getGuestSharingLink({ userid: guestId });
    console.log(data);
    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});
