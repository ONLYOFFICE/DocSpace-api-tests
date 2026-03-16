import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeType } from "@onlyoffice/docspace-api-sdk";

test.describe("PUT /people/type/:type - Change user type (permissions)", () => {
  test.fail(
    "BUG 80474: DocSpace admin should not be able to promote User to DocSpace admin",
    async ({ apiSdk }) => {
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
    },
  );

  test.fail(
    "BUG 80478: Room admin should not be able to change the type of a guest who does not belong to them.",
    async ({ apiSdk }) => {
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
    },
  );

  test("Room admin should not be able to upgrade the user type.", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const userId = (userData as any).response.id as string;

    const { data } = await roomAdminApi.userType.updateUserType(
      EmployeeType.RoomAdmin,
      { userIds: [userId] },
    );
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");

    const { data: data2 } = await roomAdminApi.userType.updateUserType(
      EmployeeType.DocSpaceAdmin,
      { userIds: [userId] },
    );
    expect(data2.statusCode).toBe(403);
    expect((data2 as any).error.message).toBe("Access denied");
  });

  test("User should not be able to change the type of a users.", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = (userData as any).response.id as string;

    const { data } = await roomAdminApi.userType.updateUserType(
      EmployeeType.RoomAdmin,
      { userIds: [userId] },
    );
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");

    const { data: data2 } = await roomAdminApi.userType.updateUserType(
      EmployeeType.DocSpaceAdmin,
      { userIds: [userId] },
    );
    expect(data2.statusCode).toBe(403);
    expect((data2 as any).error.message).toBe("Access denied");
  });

  test("User should not be able to change the type of a guest who does not belong to them.", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const guestId = (guestData as any).response.id as string;

    const { data } = await roomAdminApi.userType.updateUserType(
      EmployeeType.User,
      { userIds: [guestId] },
    );
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("An anonymous user should not be able to change the type of a user.", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "User");
    const anonApi = apiSdk.forAnonymous();
    const guestId = (guestData as any).response.id as string;

    const response = await anonApi.userType.updateUserType(EmployeeType.User, {
      userIds: [guestId],
    });
    expect(response.status).toBe(401);
  });
});

test.describe("PUT /people/type - Start user type update (permissions)", () => {
  test("starUserTypetUpdate should return 400 when userId is invalid.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data } = await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.Guest,
      userId: "00000000-0000-0000-0000-000000000000",
    });
    expect(data.statusCode).toBe(400);
    expect((data as any).error.message).toBe("Can not update type");
  });

  test("Room admin should not be able to downgrade the user type.", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const userId = (userData as any).response.id as string;

    const { data } = await roomAdminApi.userType.starUserTypetUpdate({
      type: EmployeeType.Guest,
      userId: userId,
    });
    expect(data.statusCode).toBe(200);
    expect((data as any).response.isCompleted).toBe(false);
    expect((data as any).response.error).toBe(
      "You don't have enough permission to perform the operation",
    );
  });
});

test.describe("GET /people/type/progress/{userid} - Get user type update progress (permissions)", () => {
  test("Room admin should not be able to check progress of user type update.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: adminId,
    });

    // Room admin tries to check progress
    const { data: progressData } =
      await roomAdminApi.userType.getUserTypeUpdateProgress(adminId);
    expect(progressData.statusCode).toBe(403);
    expect((progressData as any).error.message).toBe("Access denied");
  });

  test("User should not be able to check progress of user type update.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: adminId,
    });

    // User tries to check progress
    const { data: progressData } =
      await userApi.userType.getUserTypeUpdateProgress(adminId);
    expect(progressData.statusCode).toBe(403);
    expect((progressData as any).error.message).toBe("Access denied");
  });

  test("Guest should not be able to check progress of user type update.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: adminId,
    });

    // Guest tries to check progress
    const { data: progressData } =
      await guestApi.userType.getUserTypeUpdateProgress(adminId);
    expect(progressData.statusCode).toBe(403);
    expect((progressData as any).error.message).toBe("Access denied");
  });
});

test.describe("PUT /people/type/terminate - Terminate user type update (permissions)", () => {
  test("Room admin should not be able to terminate user type update started by DocSpace admin.", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    // DocSpace admin starts demotion User -> Guest
    await adminApi.userType.starUserTypetUpdate({
      type: EmployeeType.Guest,
      userId: userId,
    });

    // Room admin tries to terminate the process
    const { data: terminateData } =
      await roomAdminApi.userType.terminateUserTypeUpdate({ userId: userId });
    expect(terminateData.statusCode).toBe(403);
    expect((terminateData as any).error.message).toBe("Access denied");
  });

  test("Guest should not be able to terminate user type update started by Owner.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    // Owner starts demotion User -> Guest
    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.Guest,
      userId: userId,
    });

    // Guest tries to terminate the process
    const { data: terminateData } =
      await guestApi.userType.terminateUserTypeUpdate({ userId: userId });
    expect(terminateData.statusCode).toBe(403);
    expect((terminateData as any).error.message).toBe("Access denied");
  });

  test("Guest should not be able to terminate user type update started by DocSpace admin.", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    // DocSpace admin starts demotion User -> Guest
    await adminApi.userType.starUserTypetUpdate({
      type: EmployeeType.Guest,
      userId: userId,
    });

    // Guest tries to terminate the process
    const { data: terminateData } =
      await guestApi.userType.terminateUserTypeUpdate({ userId: userId });
    expect(terminateData.statusCode).toBe(403);
    expect((terminateData as any).error.message).toBe("Access denied");
  });

  test("User should not be able to terminate user type update started by Owner.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    // Owner starts demotion RoomAdmin -> User
    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: memberId,
    });

    // User tries to terminate the process
    const { data: terminateData } =
      await userApi.userType.terminateUserTypeUpdate({ userId: memberId });
    expect(terminateData.statusCode).toBe(403);
    expect((terminateData as any).error.message).toBe("Access denied");
  });

  test("User should not be able to terminate user type update started by DocSpace admin.", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    // DocSpace admin starts demotion RoomAdmin -> User
    await adminApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: memberId,
    });

    // User tries to terminate the process
    const { data: terminateData } =
      await userApi.userType.terminateUserTypeUpdate({ userId: memberId });
    expect(terminateData.statusCode).toBe(403);
    expect((terminateData as any).error.message).toBe("Access denied");
  });

  test("Room admin should not be able to terminate user type update started by Owner.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const memberId = memberData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    // Owner starts demotion RoomAdmin -> User
    await ownerApi.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: memberId,
    });

    // Room admin tries to terminate the process
    const { data: terminateData } =
      await roomAdminApi.userType.terminateUserTypeUpdate({ userId: memberId });
    expect(terminateData.statusCode).toBe(403);
    expect((terminateData as any).error.message).toBe("Access denied");
  });

  // Incorrect answer, you need to check the code and describe the bug if there is one.
  test.skip("Second DocSpace admin tries to terminate user type update started by first DocSpace admin.", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const admin2Base = await apiSdk.addMember("owner", "DocSpaceAdmin");

    // Create and authenticate first DocSpace admin
    const admin1Base = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const admin1Api = await apiSdk.authenticateMember(
      admin1Base.userData,
      "DocSpaceAdmin",
    );

    // First DocSpace admin starts demotion RoomAdmin -> User
    await admin1Api.userType.starUserTypetUpdate({
      type: EmployeeType.User,
      userId: roomAdminId,
    });

    // Create and authenticate second DocSpace admin (overwrites token)
    const admin2Api = await apiSdk.authenticateMember(
      admin2Base.userData,
      "DocSpaceAdmin",
    );

    // Second DocSpace admin tries to terminate the process
    const { data: terminateData } =
      await admin2Api.userType.terminateUserTypeUpdate({
        userId: roomAdminId,
      });
    console.log(terminateData as any);
  });
});
