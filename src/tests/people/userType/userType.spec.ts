import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeType } from "@onlyoffice/docspace-api-sdk";

test.describe("PUT /people/type/:type - Change user type", () => {
  test("PUT /people/type/:type - Owner promotes Guest through all user types", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    // Guest -> User
    const { data: toUserData } = await ownerApi.userType.updateUserType(
      EmployeeType.User,
      { userIds: [guestId] },
    );

    expect(toUserData.statusCode).toBe(200);
    expect(toUserData.response![0].isCollaborator).toBe(true);

    // User -> Room Admin
    const { data: toRoomAdminData } = await ownerApi.userType.updateUserType(
      EmployeeType.RoomAdmin,
      { userIds: [guestId] },
    );

    expect(toRoomAdminData.statusCode).toBe(200);
    expect(toRoomAdminData.response![0].isRoomAdmin).toBe(true);

    // Room Admin -> DocSpace Admin
    const { data: toAdminData } = await ownerApi.userType.updateUserType(
      EmployeeType.DocSpaceAdmin,
      { userIds: [guestId] },
    );

    expect(toAdminData.statusCode).toBe(200);
    expect(toAdminData.response![0].isAdmin).toBe(true);
  });

  test("PUT /people/type/:type - DocSpace admin promotes Guest to User and Room Admin", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    // Guest -> User
    const { data: toUserData } = await adminApi.userType.updateUserType(
      EmployeeType.User,
      { userIds: [guestId] },
    );

    expect(toUserData.statusCode).toBe(200);
    expect(toUserData.response![0].isCollaborator).toBe(true);

    // User -> Room Admin
    const { data: toRoomAdminData } = await adminApi.userType.updateUserType(
      EmployeeType.RoomAdmin,
      { userIds: [guestId] },
    );

    expect(toRoomAdminData.statusCode).toBe(200);
    expect(toRoomAdminData.response![0].isRoomAdmin).toBe(true);
  });
});
