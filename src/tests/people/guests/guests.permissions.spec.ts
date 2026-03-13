import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

test.describe("DELETE /people/guests - Permissions", () => {
  test.skip("BUG 80628: DELETE /people/guests - Room admin cannot delete another user's deactivated guest", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk
      .forRole("owner")
      .userStatus.updateUserStatus(EmployeeStatus.Terminated, {
        userIds: [guestId],
      });

    const { userData: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    await apiSdk.authenticateMember(roomAdminData, "RoomAdmin");

    const { data } = await apiSdk
      .forRole("roomAdmin")
      .guests.deleteGuests({ userIds: [guestId] });

    expect((data as any).statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test.skip("BUG 80628: DELETE /people/guests - Room admin cannot delete another user's guest", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { userData: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    await apiSdk.authenticateMember(roomAdminData, "RoomAdmin");

    const { data } = await apiSdk
      .forRole("roomAdmin")
      .guests.deleteGuests({ userIds: [guestId] });

    expect((data as any).statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("DELETE /people/guests - User cannot delete a guest", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk
      .forRole("owner")
      .userStatus.updateUserStatus(EmployeeStatus.Terminated, {
        userIds: [guestId],
      });

    const { userData: userData } = await apiSdk.addMember("owner", "User");
    await apiSdk.authenticateMember(userData, "User");

    const { data } = await apiSdk
      .forRole("user")
      .guests.deleteGuests({ userIds: [guestId] });

    expect((data as any).statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("DELETE /people/guests - Guest cannot delete a guest", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await apiSdk
      .forRole("owner")
      .userStatus.updateUserStatus(EmployeeStatus.Terminated, {
        userIds: [guestId],
      });

    const { userData: guestAttackerData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    await apiSdk.authenticateMember(guestAttackerData, "Guest");

    const { data } = await apiSdk
      .forRole("guest")
      .guests.deleteGuests({ userIds: [guestId] });

    expect((data as any).statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("DELETE /people/guests - 401 when unauthorized", async ({ apiSdk }) => {
    const { status } = await apiSdk.forAnonymous().guests.deleteGuests({
      userIds: ["00000000-0000-0000-0000-000000000000"],
    });

    expect(status).toBe(401);
  });
});
