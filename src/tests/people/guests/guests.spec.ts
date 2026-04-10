import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

// approveGuestShareLink — requires browser session context (cookie set by frontend
// when opening external share link page), not possible to automate via API tests

test.describe("DELETE /people/guests - Delete guests", () => {
  test("DELETE /people/guests - Owner deletes a deactivated guest", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "Guest");
    const guestId = memberData.response!.id!;

    const ownerApi = apiSdk.forRole("owner");

    // Deactivate the guest before deletion
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [guestId] },
    });

    // Delete the guest
    const { data, status } = await ownerApi.guests.deleteGuests({
      updateMembersRequestDto: { userIds: [guestId] },
    });
    const body = data as any;

    expect(status).toBe(200);
    expect(body.statusCode).toBe(200);

    // Verify guest is no longer in the people list
    const { data: allProfiles } = await ownerApi.profiles.getAllProfiles();
    const people = (allProfiles as any).response ?? [];
    const foundGuest = people.find((p: any) => p.id === guestId);

    expect(foundGuest).toBeUndefined();
  });

  test("DELETE /people/guests - DocSpace admin deletes a deactivated guest", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "Guest");
    const guestId = memberData.response!.id!;

    const ownerApi = apiSdk.forRole("owner");

    // Deactivate the guest before deletion
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [guestId] },
    });

    // Authenticate DocSpaceAdmin
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminApi = apiSdk.forRole("docSpaceAdmin");

    // DocSpaceAdmin deletes the guest
    const { data, status } = await docSpaceAdminApi.guests.deleteGuests({
      updateMembersRequestDto: { userIds: [guestId] },
    });
    const body = data as any;

    expect(status).toBe(200);
    expect(body.statusCode).toBe(200);

    // Verify guest is no longer in the people list
    const { data: allProfiles } =
      await docSpaceAdminApi.profiles.getAllProfiles();
    const people = (allProfiles as any).response ?? [];
    const foundGuest = people.find((p: any) => p.id === guestId);

    expect(foundGuest).toBeUndefined();
  });
});
