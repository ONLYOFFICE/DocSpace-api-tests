import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, EmployeeStatus } from "@onlyoffice/docspace-api-sdk";
test.describe("PUT /people/self/delete - Send instructions to delete profile", () => {
  test("PUT /people/self/delete - All user types can send deletion instructions", async ({
    apiSdk,
  }) => {
    const { userData: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { userData: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const { userData: userData } = await apiSdk.addMember("owner", "User");
    const { userData: guestData } = await apiSdk.addMember("owner", "Guest");

    await test.step("DocSpace admin sends deletion instructions", async () => {
      await apiSdk.authenticateMember(docSpaceAdminData, "DocSpaceAdmin");
      const { data } = await apiSdk
        .forRole("docSpaceAdmin")
        .userData.sendInstructionsToDelete();

      expect(data.statusCode).toBe(200);
      expect(data.response).toContain(docSpaceAdminData.email);
    });

    await test.step("Room admin sends deletion instructions", async () => {
      await apiSdk.authenticateMember(roomAdminData, "RoomAdmin");
      const { data } = await apiSdk
        .forRole("roomAdmin")
        .userData.sendInstructionsToDelete();

      expect(data.statusCode).toBe(200);
      expect(data.response).toContain(roomAdminData.email);
    });

    await test.step("User sends deletion instructions", async () => {
      await apiSdk.authenticateMember(userData, "User");
      const { data } = await apiSdk
        .forRole("user")
        .userData.sendInstructionsToDelete();

      expect(data.statusCode).toBe(200);
      expect(data.response).toContain(userData.email);
    });

    await test.step("Guest sends deletion instructions", async () => {
      await apiSdk.authenticateMember(guestData, "Guest");
      const { data } = await apiSdk
        .forRole("guest")
        .userData.sendInstructionsToDelete();

      expect(data.statusCode).toBe(200);
      expect(data.response).toContain(guestData.email);
    });
  });
});

test.describe("GET /people/reassign/necessary - Check data for reassignment need", () => {
  test("GET /people/reassign/necessary - Owner checks reassignment need", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    const { data } = await ownerApi.userData.necessaryReassign();

    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("GET /people/reassign/necessary - DocSpace admin checks reassignment need", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await docSpaceAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await docSpaceAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    const { data } = await docSpaceAdminApi.userData.necessaryReassign();

    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });
});

// startDeletePersonalFolder, getDeletePersonalFolderProgress
// return 403 for all roles — these methods are executed by the system internally
// and are not accessible via API

test.describe("POST /people/reassign/start - Start data reassignment", () => {
  test("POST /people/reassign/start - Owner reassigns deactivated RoomAdmin data to himself", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to restore session after RoomAdmin auth
    const ownerApi = await apiSdk.authenticateOwner();
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    // Deactivate RoomAdmin before reassignment
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Owner starts reassignment from deactivated RoomAdmin to Owner
    const { data } = await ownerApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: roomAdminId,
        toUserId: ownerId,
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBe(false);
    expect(data.response?.percentage).toBeGreaterThanOrEqual(0);
    expect(data.response?.error).toBe("");
  });

  test("POST /people/reassign/start - DocSpace admin reassigns deactivated RoomAdmin data to himself", async ({
    apiSdk,
  }) => {
    // Create DocSpaceAdmin
    const { data: adminMember, userData: docSpaceAdminUserData } =
      await apiSdk.addMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = adminMember.response!.id!;

    // Create RoomAdmin
    const { data: roomAdminMember, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminMember.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate RoomAdmin
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Authenticate DocSpaceAdmin to perform reassignment
    const docSpaceAdminApi = await apiSdk.authenticateMember(
      docSpaceAdminUserData,
      "DocSpaceAdmin",
    );

    // DocSpaceAdmin starts reassignment from deactivated RoomAdmin to himself
    const { data } = await docSpaceAdminApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: roomAdminId,
        toUserId: docSpaceAdminId,
      },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBe(false);
    expect(data.response?.percentage).toBeGreaterThanOrEqual(0);
    expect(data.response?.error).toBe("");
  });
});

test.describe("GET /people/reassign/progress - Check reassignment progress", () => {
  test("GET /people/reassign/progress/:userid - Owner checks reassign progress", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner
    const ownerApi = await apiSdk.authenticateOwner();
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    // Deactivate RoomAdmin
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Start reassignment
    await ownerApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: roomAdminId,
        toUserId: ownerId,
      },
    });

    // Check progress
    const { data } = await ownerApi.userData.getReassignProgress({
      userid: roomAdminId,
    });

    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBeDefined();
    expect(data.response?.percentage).toBeDefined();
    expect(data.response?.error).toBe("");
    expect(data.response?.status).toBe(2);
  });

  test("GET /people/reassign/progress/:userid - DocSpace admin checks reassign progress", async ({
    apiSdk,
  }) => {
    // Create DocSpaceAdmin
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );

    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate RoomAdmin
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Authenticate DocSpaceAdmin
    const docSpaceAdminApi = await apiSdk.authenticateMember(
      docSpaceAdminUserData,
      "DocSpaceAdmin",
    );
    const { data: adminProfile } =
      await docSpaceAdminApi.profiles.getSelfProfile();
    const docSpaceAdminId = adminProfile.response!.id!;

    // DocSpaceAdmin starts reassignment
    await docSpaceAdminApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: roomAdminId,
        toUserId: docSpaceAdminId,
      },
    });

    // DocSpaceAdmin checks progress
    const { data } = await docSpaceAdminApi.userData.getReassignProgress({
      userid: roomAdminId,
    });

    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBeDefined();
    expect(data.response?.percentage).toBe(100);
    expect(data.response?.error).toBe("");
    expect(data.response?.status).toBe(2);
  });
});

test.describe("PUT /people/reassign/terminate - Terminate data reassignment", () => {
  test("PUT /people/reassign/terminate - Owner terminates reassignment", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner
    const ownerApi = await apiSdk.authenticateOwner();
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    // Deactivate RoomAdmin
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Start reassignment
    await ownerApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: roomAdminId,
        toUserId: ownerId,
      },
    });

    // Terminate reassignment
    const { data } = await ownerApi.userData.terminateReassign({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBe(true);
    expect(data.response?.percentage).toBe(100);
    expect(data.response?.error).toBe("");
    expect(data.response?.status).toBe(3);
  });

  test("PUT /people/reassign/terminate - DocSpace admin terminates reassignment", async ({
    apiSdk,
  }) => {
    // Create DocSpaceAdmin
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );

    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Reassign Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Reassign File",
      },
    });

    // Re-authenticate owner to deactivate RoomAdmin
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Authenticate DocSpaceAdmin
    const docSpaceAdminApi = await apiSdk.authenticateMember(
      docSpaceAdminUserData,
      "DocSpaceAdmin",
    );
    const { data: adminProfile } =
      await docSpaceAdminApi.profiles.getSelfProfile();
    const docSpaceAdminId = adminProfile.response!.id!;

    // DocSpaceAdmin starts reassignment
    await docSpaceAdminApi.userData.startReassign({
      startReassignRequestDto: {
        fromUserId: roomAdminId,
        toUserId: docSpaceAdminId,
      },
    });

    // DocSpaceAdmin terminates reassignment
    const { data } = await docSpaceAdminApi.userData.terminateReassign({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBe(true);
    expect(data.response?.percentage).toBe(100);
    expect(data.response?.error).toBe("");
    expect(data.response?.status).toBe(3);
  });
});

test.describe("POST /people/remove/start - Start data removal", () => {
  test("POST /people/remove/start - Owner removes deactivated RoomAdmin data", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Remove File",
      },
    });

    // Re-authenticate owner
    const ownerApi = await apiSdk.authenticateOwner();

    // Deactivate RoomAdmin
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Start data removal
    const { data } = await ownerApi.userData.startRemove({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBe(false);
    expect(data.response?.percentage).toBeGreaterThanOrEqual(0);
    expect(data.response?.error).toBe("");
    expect(data.response?.status).toBe(1);
  });

  test("POST /people/remove/start - DocSpace admin removes deactivated RoomAdmin data", async ({
    apiSdk,
  }) => {
    // Create DocSpaceAdmin
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );

    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Remove File",
      },
    });

    // Re-authenticate owner to deactivate RoomAdmin
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Authenticate DocSpaceAdmin to perform removal
    const docSpaceAdminApi = await apiSdk.authenticateMember(
      docSpaceAdminUserData,
      "DocSpaceAdmin",
    );

    // DocSpaceAdmin starts data removal
    const { data } = await docSpaceAdminApi.userData.startRemove({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });

    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBe(false);
    expect(data.response?.percentage).toBeGreaterThanOrEqual(0);
    expect(data.response?.error).toBe("");
    expect(data.response?.status).toBe(1);
  });
});

test.describe("GET /people/remove/progress - Check data removal progress", () => {
  test("GET /people/remove/progress/:userid - Owner checks removal progress", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room with a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    await roomAdminApi.files.createFile({
      folderId: roomData.response!.id!,
      createFileJsonElement: {
        title: "Autotest Remove File",
      },
    });

    // Re-authenticate owner
    const ownerApi = await apiSdk.authenticateOwner();

    // Deactivate RoomAdmin
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Start data removal
    await ownerApi.userData.startRemove({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });

    // Check progress
    const { data } = await ownerApi.userData.getRemoveProgress({
      userid: roomAdminId,
    });
    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBeDefined();
    expect(data.response?.error).toBe("");
  });

  test("GET /people/remove/progress/:userid - DocSpace admin checks removal progress", async ({
    apiSdk,
  }) => {
    // Create DocSpaceAdmin
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );

    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room with a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    await roomAdminApi.files.createFile({
      folderId: roomData.response!.id!,
      createFileJsonElement: {
        title: "Autotest Remove File",
      },
    });

    // Re-authenticate owner to deactivate RoomAdmin
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Authenticate DocSpaceAdmin
    const docSpaceAdminApi = await apiSdk.authenticateMember(
      docSpaceAdminUserData,
      "DocSpaceAdmin",
    );

    // DocSpaceAdmin starts data removal
    await docSpaceAdminApi.userData.startRemove({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });

    // DocSpaceAdmin checks progress
    const { data } = await docSpaceAdminApi.userData.getRemoveProgress({
      userid: roomAdminId,
    });

    expect(data.statusCode).toBe(200);
    expect(data.response?.isCompleted).toBeDefined();
    expect(data.response?.error).toBe("");
  });
});

test.describe("PUT /people/remove/terminate - Terminate data removal", () => {
  test("PUT /people/remove/terminate - Owner terminates data removal", async ({
    apiSdk,
  }) => {
    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Remove File",
      },
    });

    // Re-authenticate owner
    const ownerApi = await apiSdk.authenticateOwner();

    // Deactivate RoomAdmin
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Start data removal
    await ownerApi.userData.startRemove({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });

    // Terminate data removal (returns no response body, only statusCode)
    const { data, status } = await ownerApi.userData.terminateRemove({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });
    const body = data as any;

    expect(status).toBe(200);
    expect(body.statusCode).toBe(200);
  });

  test("PUT /people/remove/terminate - DocSpace admin terminates data removal", async ({
    apiSdk,
  }) => {
    // Create DocSpaceAdmin
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );

    // Create RoomAdmin
    const { data: memberData, userData: roomAdminUserData } =
      await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = memberData.response!.id!;

    // Authenticate RoomAdmin so they can create data
    const roomAdminApi = await apiSdk.authenticateMember(
      roomAdminUserData,
      "RoomAdmin",
    );

    // RoomAdmin creates a room and a file
    const { data: roomData } = await roomAdminApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;
    await roomAdminApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Remove File",
      },
    });

    // Re-authenticate owner to deactivate RoomAdmin
    const ownerApi = await apiSdk.authenticateOwner();
    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [roomAdminId],
      },
    });

    // Authenticate DocSpaceAdmin
    const docSpaceAdminApi = await apiSdk.authenticateMember(
      docSpaceAdminUserData,
      "DocSpaceAdmin",
    );

    // DocSpaceAdmin starts data removal
    await docSpaceAdminApi.userData.startRemove({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });

    // DocSpaceAdmin terminates data removal (returns no response body, only statusCode)
    const { data, status } = await docSpaceAdminApi.userData.terminateRemove({
      terminateRequestDto: {
        userId: roomAdminId,
      },
    });
    const body = data as any;

    expect(status).toBe(200);
    expect(body.statusCode).toBe(200);
  });
});
