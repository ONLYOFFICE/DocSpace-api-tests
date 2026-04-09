import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

test.describe("PUT /people/self/delete - Permissions", () => {
  test("PUT /people/self/delete - Owner cannot send deletion instructions", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk
      .forRole("owner")
      .userData.sendInstructionsToDelete();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("PUT /people/self/delete - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .userData.sendInstructionsToDelete();

    expect(status).toBe(401);
  });
});

test.describe("DELETE /people/delete/personal - Permissions", () => {
  test("DELETE /people/delete/personal - Owner cannot delete personal folder", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk
      .forRole("owner")
      .userData.startDeletePersonalFolder();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("DELETE /people/delete/personal - DocSpace admin cannot delete personal folder", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data } = await apiSdk
      .forRole("docSpaceAdmin")
      .userData.startDeletePersonalFolder();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("DELETE /people/delete/personal - Room admin cannot delete personal folder", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data } = await apiSdk
      .forRole("roomAdmin")
      .userData.startDeletePersonalFolder();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("DELETE /people/delete/personal - User cannot delete personal folder", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data } = await apiSdk
      .forRole("user")
      .userData.startDeletePersonalFolder();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("DELETE /people/delete/personal - Guest cannot delete personal folder", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data } = await apiSdk
      .forRole("guest")
      .userData.startDeletePersonalFolder();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("DELETE /people/delete/personal - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .userData.startDeletePersonalFolder();

    expect(status).toBe(401);
  });
});

test.describe("GET /people/reassign/necessary - Permissions", () => {
  test("GET /people/reassign/necessary - Room admin cannot check reassignment need", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data } = await apiSdk
      .forRole("roomAdmin")
      .userData.necessaryReassign();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/reassign/necessary - User cannot check reassignment need", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data } = await apiSdk.forRole("user").userData.necessaryReassign();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/reassign/necessary - Guest cannot check reassignment need", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data } = await apiSdk.forRole("guest").userData.necessaryReassign();

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/reassign/necessary - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().userData.necessaryReassign();

    expect(status).toBe(401);
  });
});

test.describe("POST /people/reassign/start - Permissions", () => {
  test("POST /people/reassign/start - Room admin cannot start reassignment", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin who will have data
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    // Authenticate target user so they can create data
    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    // Target creates a room and a file
    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate target user
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    // Create another RoomAdmin who will attempt reassignment
    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );
    const { data: roomAdminProfile } =
      await roomAdminApi.profiles.getSelfProfile();
    const roomAdminId = roomAdminProfile.response!.id!;

    const { data } = await roomAdminApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: targetUserId,
        toUserId: roomAdminId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("POST /people/reassign/start - User cannot start reassignment", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin who will have data
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    // Authenticate target user so they can create data
    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    // Target creates a room and a file
    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate target user
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    // Create User who will attempt reassignment
    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userApi = await apiSdk.authenticateMember(userUserData, "User");
    const { data: userProfile } = await userApi.profiles.getSelfProfile();
    const userId = userProfile.response!.id!;

    const { data } = await userApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: targetUserId,
        toUserId: userId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("POST /people/reassign/start - Guest cannot start reassignment", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin who will have data
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    // Authenticate target user so they can create data
    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    // Target creates a room and a file
    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate target user
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    // Create Guest who will attempt reassignment
    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");
    const { data: guestProfile } = await guestApi.profiles.getSelfProfile();
    const guestId = guestProfile.response!.id!;

    const { data } = await guestApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: targetUserId,
        toUserId: guestId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("POST /people/reassign/start - Cannot reassign data from active user", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data } = await ownerApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: roomAdminId,
        toUserId: ownerId,
      },
    });

    expect(data.statusCode).toBe(400);
    expect((data as any).error?.message).toContain("Can not reassign data");
  });

  test("POST /people/reassign/start - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().userData.startReassign({
      startReassignRequestDto: {
        fromUserId: "00000000-0000-0000-0000-000000000000",
        toUserId: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /people/reassign/progress - Permissions", () => {
  test("GET /people/reassign/progress/:userid - Room admin cannot check reassign progress", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.userData.getReassignProgress({
      userid: targetUserId,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/reassign/progress/:userid - User cannot check reassign progress", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userApi = await apiSdk.authenticateMember(userUserData, "User");

    const { data } = await userApi.userData.getReassignProgress({
      userid: targetUserId,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/reassign/progress/:userid - Guest cannot check reassign progress", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data } = await guestApi.userData.getReassignProgress({
      userid: targetUserId,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/reassign/progress/:userid - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .userData.getReassignProgress({
        userid: "00000000-0000-0000-0000-000000000000",
      });

    expect(status).toBe(401);
  });

  test("BUG 78957: DocSpace admin should not be able to check reassign progress for a DocSpace admin they have no access to", async ({
    apiSdk,
  }) => {
    // Create DocSpace admin2 (who will be blocked and have data reassigned by Owner)
    const { data: admin2Data } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const admin2Id = admin2Data.response!.id!;

    // Create and authenticate DocSpace admin1 (who will attempt to check progress)
    const { api: admin1Api } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const ownerApi = await apiSdk.authenticateOwner();

    // Owner blocks DocSpace admin2
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [admin2Id] },
    });

    // Owner gets their own ID to use as reassignment target
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    // Owner starts reassignment of admin2's data to themselves
    await ownerApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: admin2Id,
        toUserId: ownerId,
      },
    });

    // DocSpace admin1 tries to check the progress of admin2's reassignment
    const { data } = await admin1Api.userData.getReassignProgress({
      userid: admin2Id,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });
});

test.describe("PUT /people/reassign/terminate - Permissions", () => {
  test("PUT /people/reassign/terminate - Room admin cannot terminate reassignment", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    // Authenticate target user so they can create data
    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    // Target creates a room and a file
    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate target and start reassignment
    const ownerApi = await apiSdk.authenticateOwner();
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    await ownerApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: targetUserId,
        toUserId: ownerId,
      },
    });

    // Create another RoomAdmin who will attempt to terminate
    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.userData.terminateReassign({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("PUT /people/reassign/terminate - User cannot terminate reassignment", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    // Authenticate target user so they can create data
    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    // Target creates a room and a file
    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate target and start reassignment
    const ownerApi = await apiSdk.authenticateOwner();
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    await ownerApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: targetUserId,
        toUserId: ownerId,
      },
    });

    // Create User who will attempt to terminate
    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userApi = await apiSdk.authenticateMember(userUserData, "User");

    const { data } = await userApi.userData.terminateReassign({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("PUT /people/reassign/terminate - Guest cannot terminate reassignment", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    // Authenticate target user so they can create data
    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    // Target creates a room and a file
    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate target and start reassignment
    const ownerApi = await apiSdk.authenticateOwner();
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    await ownerApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: targetUserId,
        toUserId: ownerId,
      },
    });

    // Create Guest who will attempt to terminate
    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data } = await guestApi.userData.terminateReassign({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("PUT /people/reassign/terminate - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().userData.terminateReassign({
      terminateRequestDto: {
        userId: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("POST /people/remove/start - Permissions", () => {
  test("POST /people/remove/start - Room admin cannot start data removal", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Remove File" },
    });

    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.userData.startRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("POST /people/remove/start - User cannot start data removal", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Remove File" },
    });

    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userApi = await apiSdk.authenticateMember(userUserData, "User");

    const { data } = await userApi.userData.startRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("POST /people/remove/start - Guest cannot start data removal", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Remove File" },
    });

    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data } = await guestApi.userData.startRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("POST /people/remove/start - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().userData.startRemove({
      terminateRequestDto: {
        userId: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /people/remove/progress - Permissions", () => {
  test("GET /people/remove/progress/:userid - Room admin cannot check removal progress", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.userData.getRemoveProgress({
      userid: targetUserId,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/remove/progress/:userid - User cannot check removal progress", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userApi = await apiSdk.authenticateMember(userUserData, "User");

    const { data } = await userApi.userData.getRemoveProgress({
      userid: targetUserId,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/remove/progress/:userid - Guest cannot check removal progress", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data } = await guestApi.userData.getRemoveProgress({
      userid: targetUserId,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/remove/progress/:userid - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().userData.getRemoveProgress({
      userid: "00000000-0000-0000-0000-000000000000",
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /people/remove/terminate - Permissions", () => {
  test("PUT /people/remove/terminate - Room admin cannot terminate data removal", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Remove File" },
    });

    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    await ownerApi.userData.startRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.userData.terminateRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });
    const body = data as any;

    expect(body.statusCode).toBe(403);
    expect(body.error?.message).toContain("Access denied");
  });

  test("PUT /people/remove/terminate - User cannot terminate data removal", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Remove File" },
    });

    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    await ownerApi.userData.startRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userApi = await apiSdk.authenticateMember(userUserData, "User");

    const { data } = await userApi.userData.terminateRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });
    const body = data as any;

    expect(body.statusCode).toBe(403);
    expect(body.error?.message).toContain("Access denied");
  });

  test("PUT /people/remove/terminate - Guest cannot terminate data removal", async ({
    apiSdk,
  }) => {
    const { data: memberData, userData: targetUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const targetUserId = memberData.response!.id!;

    const targetApi = await apiSdk.authenticateMember(
      targetUserData,
      "RoomAdmin",
    );

    const { data: roomData } = await targetApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await targetApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Remove File" },
    });

    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [targetUserId],
      },
    });

    await ownerApi.userData.startRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestApi = await apiSdk.authenticateMember(guestUserData, "Guest");

    const { data } = await guestApi.userData.terminateRemove({
      terminateRequestDto: {
        userId: targetUserId,
      },
    });
    const body = data as any;

    expect(body.statusCode).toBe(403);
    expect(body.error?.message).toContain("Access denied");
  });

  test("PUT /people/remove/terminate - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().userData.terminateRemove({
      terminateRequestDto: {
        userId: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(status).toBe(401);
  });
});
