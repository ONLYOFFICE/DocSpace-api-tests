import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeType } from "@onlyoffice/docspace-api-sdk";

test.describe("PUT /people/type/:type - Change user type (permissions)", () => {
  test.skip("BUG: DocSpace admin should not be able to promote User to DocSpace admin", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data } = await adminApi.userType.updateUserType(
      EmployeeType.DocSpaceAdmin,
      { userIds: [userId] },
    );
    console.log(data as any); // delete this string after fixing the bug
    // BUG: API returns 200, expected 403
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test.skip("BUG: Room admin should not be able to change the type of a guest who does not belong to them.", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const guestId = (guestData as any).response.id as string;

    const { data } = await roomAdminApi.userType.updateUserType(
      EmployeeType.User,
      { userIds: [guestId] },
    );
    console.log(data as any); // delete this string after fixing the bug
    // BUG: API returns 200, expected 403
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});
