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

  test("PUT /people/type/:type & PUT /people/type - Owner demotes DocSpace admin through all user types", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    // DocSpace Admin -> Room Admin
    const { data: toRoomAdminData } = await ownerApi.userType.updateUserType(
      EmployeeType.RoomAdmin,
      { userIds: [adminId] },
    );

    expect(toRoomAdminData.statusCode).toBe(200);
    expect(toRoomAdminData.response![0].isRoomAdmin).toBe(true);

    // Room Admin -> User
    const { data: toUserData } = await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: adminId,
    });

    expect(toUserData.statusCode).toBe(200);

    // User -> Guest
    const { data: toGuestData } = await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.Guest,
      userId: adminId,
    });

    expect(toGuestData.statusCode).toBe(200);
  });

  test("PUT /people/type - DocSpace admin demotes Room Admin to User and Guest", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // Room Admin -> User
    const { data: toUserData } = await adminApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: roomAdminId,
    });

    expect(toUserData.statusCode).toBe(200);

    // User -> Guest
    const { data: toGuestData } = await adminApi.userType.starUserTypetUpdate({
      type: EmployeeType.Guest,
      userId: roomAdminId,
    });

    expect(toGuestData.statusCode).toBe(200);
  });
});

test.describe("GET /people/type/progress/{userid} - Get user type update progress", () => {
  test("Owner demotes DocSpace admin to User and checks progress", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: adminId,
    });

    // Poll progress until completed
    let isCompleted = false;
    let progressData: any;

    while (!isCompleted) {
      const { data } =
        await ownerApi.userType.getUserTypeUpdateProgress(adminId);
      progressData = data;
      isCompleted = (data as any).response?.isCompleted === true;

      if (!isCompleted) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    expect(progressData.statusCode).toBe(200);
    expect(progressData.response.isCompleted).toBe(true);
    expect(progressData.response.percentage).toBe(100);
    expect(progressData.response.error).toBe("");
  });

  test("DocSpace admin demotes Room admin to User and checks progress", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    await adminApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: roomAdminId,
    });

    // Poll progress until completed
    let isCompleted = false;
    let progressData: any;

    while (!isCompleted) {
      const { data } =
        await adminApi.userType.getUserTypeUpdateProgress(roomAdminId);
      progressData = data;
      isCompleted = (data as any).response?.isCompleted === true;

      if (!isCompleted) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    expect(progressData.statusCode).toBe(200);
    expect(progressData.response.isCompleted).toBe(true);
    expect(progressData.response.percentage).toBe(100);
    expect(progressData.response.error).toBe("");
  });
});

test.describe("PUT /people/type/terminate - Terminate user type update", () => {
  test("Owner terminates user type update", async ({ apiSdk }) => {
    test.skip(true, "Unstable: single-user type update completes too fast for terminate to catch it");

    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    // Start demotion
    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: adminId,
    });

    // Terminate the process
    const { data: terminateData } =
      await ownerApi.userType.terminateUserTypeUpdate({ userId: adminId });
      console.log("Terminate response:", terminateData);
    expect(terminateData.statusCode).toBe(200);
    expect((terminateData as any).response.isCompleted).toBe(true);
    expect((terminateData as any).response.error).toBe("");
    expect((terminateData as any).response.status).toBe(3);

    // Verify user is still DocSpace admin
    const { data: profileData } =
      await ownerApi.profiles.getProfileByUserId(adminId);
    expect(profileData.response!.isAdmin).toBe(true);
  });

  // Incorrect answer, you need to check the code and describe the bug if there is one.
  test.skip("DocSpace admin terminates user type update started by Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const userId = userData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // Owner starts demotion
    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: userId,
    });

    // DocSpace admin terminates the process
    const { data: terminateData } =
      await adminApi.userType.terminateUserTypeUpdate({ userId: userId });
    console.log("Terminate response:", terminateData);
    expect(terminateData.statusCode).toBe(200);
    expect((terminateData as any).response.isCompleted).toBe(true);
    expect((terminateData as any).response.error).toBe("");
    expect((terminateData as any).response.status).toBe(3);

    // Verify user is still DocSpace admin
    const { data: profileData } =
      await ownerApi.profiles.getProfileByUserId(userId);
    expect(profileData.response!.isAdmin).toBe(true);
  });

  test("DocSpace admin terminates own user type update of Room admin", async ({
    apiSdk,
  }) => {
    test.skip(true, "Unstable: single-user type update completes too fast for terminate to catch it");
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    // DocSpace admin starts demotion
    await adminApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: roomAdminId,
    });

    // DocSpace admin terminates the process
    const { data: terminateData } =
      await adminApi.userType.terminateUserTypeUpdate({ userId: roomAdminId });
    expect(terminateData.statusCode).toBe(200);
    expect((terminateData as any).response.isCompleted).toBe(true);
    expect((terminateData as any).response.error).toBe("");
    expect((terminateData as any).response.status).toBe(3);

    // Verify user is still Room admin
    const { data: profileData } =
      await adminApi.profiles.getProfileByUserId(roomAdminId);
    expect(profileData.response!.isRoomAdmin).toBe(true);
  });
});
