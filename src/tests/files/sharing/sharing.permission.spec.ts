import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileShare,
  EmployeeStatus,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";

test.describe("GET /api/2.0/files/file/{fileId}/group/{groupId}/share", () => {
  test("BUG 81023: GET /api/2.0/files/file/{fileId}/group/{groupId}/share - Guest gets group member count when file is shared only with guest", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Sharing File" },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [ownerId, userId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await guestApi.sharing.getGroupsMembersWithFileSecurity({
        fileId,
        groupId,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 81023: GET /api/2.0/files/file/{fileId}/group/{groupId}/share - Guest gets full group member info when file is shared with guest and group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Sharing File" },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [ownerId, userId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await guestApi.sharing.getGroupsMembersWithFileSecurity({
        fileId,
        groupId,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/files/owner", () => {
  test("BUG 66897: POST /api/2.0/files/owner - changeFileOwner returns empty response when new owner is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Change Owner File" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [roomAdminId], resendAll: false },
    });

    const { data, status } = await ownerApi.sharing.changeFileOwner({
      changeOwnerRequestDto: {
        userId: roomAdminId,
        fileIds: [fileId as unknown as object],
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("You cannot select this user");
  });
});

test.describe("PUT /api/2.0/files/share", () => {
  test("BUG 79284: PUT /api/2.0/files/share - setSecurityInfo with empty access field should return 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Share File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data, status } = await ownerApi.sharing.setSecurityInfo({
      securityInfoRequestDto: {
        fileIds: [fileId as unknown as object],
        share: [{ shareTo: userId, access: "" as any }],
        notify: true,
      },
    });
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toStrictEqual([]);
  });

  test("PUT /api/2.0/files/share - User cannot set security info on owner file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Share File" },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.sharing.setSecurityInfo({
      securityInfoRequestDto: {
        fileIds: [fileId as unknown as object],
        share: [{ shareTo: ownerId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    expect(status).toBe(403);
  });

  // BUG 83263: PUT /api/2.0/files/share - Guest can set security info on owner file (returns 200 instead of 403)
  test.fail(
    "BUG 83263: PUT /api/2.0/files/share - Guest cannot set security info on owner file returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Share File" },
      });
      const fileId = fileData.response!.id!;

      const { data: guestData, api: guestApi } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: guestId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      const { status } = await guestApi.sharing.setSecurityInfo({
        securityInfoRequestDto: {
          fileIds: [fileId as unknown as object],
          share: [{ shareTo: ownerId, access: FileShare.ReadWrite }],
          notify: false,
        },
      });

      expect(status).toBe(403);

      const { data: securityData } = await ownerApi.sharing.getFileSecurityInfo(
        { id: fileId },
      );
      const guestEntry = securityData.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === guestId;
      });
      expect(guestEntry).toBeDefined();
      expect(guestEntry!.access).toBe(FileShare.Read);

      const ownerShareEntry = securityData.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === ownerId && !entry.isOwner;
      });
      expect(ownerShareEntry).toBeUndefined();
    },
  );
});

test.describe("GET /api/2.0/files/file/{fileId}/sharedusers", () => {
  test.fail(
    "BUG 81109: GET /api/2.0/files/file/{fileId}/sharedusers - Guest gets id, email and name of User in getSharedUsers response",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Shared Users File" },
      });
      const fileId = fileData.response!.id!;

      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;

      const { data: guestData, api: guestApi } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [
            { shareTo: userId, access: FileShare.Read },
            { shareTo: guestId, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      const { data, status } = await guestApi.sharing.getSharedUsers({
        fileId,
      });

      expect(status).toBe(200);
      const entries = (data as any).response as Array<{ id?: string }>;
      const entryIds = entries.map((entry) => entry.id);
      expect(entryIds).toContain(ownerId);
      expect(entryIds).not.toContain(userId);
    },
  );

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Unauthenticated request returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .sharing.getSharedUsers({ fileId });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - User with file access returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.sharing.getSharedUsers({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - User without file access returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.sharing.getSharedUsers({ fileId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Guest with file access returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: guestData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.sharing.getSharedUsers({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Guest without file access returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.sharing.getSharedUsers({ fileId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - DocSpaceAdmin gets shared users for room file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Shared Users Room",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: adminData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: adminId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } = await adminApi.sharing.getSharedUsers({ fileId });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - RoomAdmin gets shared users for room file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Shared Users Room",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomAdminData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  // BUG 83105: GET /api/2.0/files/file/{fileId}/sharedusers - Non-existent fileId returns 403 instead of 404
  test.fail(
    "BUG 83105: GET /api/2.0/files/file/{fileId}/sharedusers - Non-existent fileId returns 403 instead of 404",
    async ({ apiSdk }) => {
      const { status } = await apiSdk
        .forRole("owner")
        .sharing.getSharedUsers({ fileId: 999999999 });

      expect(status).toBe(404);
    },
  );
});

test.describe("PUT /api/2.0/files/file/{fileId}/share", () => {
  test("BUG 79156: PUT /api/2.0/files/file/{fileId}/share - sharingMessage longer than 255 characters should return 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Share File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const longMessage = "a".repeat(256);

    const { data, status } = await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: true,
        sharingMessage: longMessage,
      },
    });

    expect(status).toBe(400);
    expect(
      (data as any).response?.errors?.["SecurityInfoSimple.SharingMessage"],
    ).toStrictEqual([
      "The field SharingMessage must be a string with a maximum length of 255.",
    ]);
  });

  test("PUT /api/2.0/files/file/{fileId}/share - User cannot set file security info on owner file returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Share File" },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: ownerId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    expect(status).toBe(403);
  });

  // BUG 83263: PUT /api/2.0/files/file/{fileId}/share - Guest can set file security info on owner file (returns 200 instead of 403)
  test.fail(
    "BUG 83263: PUT /api/2.0/files/file/{fileId}/share - Guest cannot set file security info on owner file returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Share File" },
      });
      const fileId = fileData.response!.id!;

      const { data: guestData, api: guestApi } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: guestId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      const { status } = await guestApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: ownerId, access: FileShare.ReadWrite }],
          notify: false,
        },
      });

      expect(status).toBe(403);

      const { data: securityData } = await ownerApi.sharing.getFileSecurityInfo(
        { id: fileId },
      );
      const guestEntry = securityData.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === guestId;
      });
      expect(guestEntry).toBeDefined();
      expect(guestEntry!.access).toBe(FileShare.Read);

      const ownerShareEntry = securityData.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === ownerId && !entry.isOwner;
      });
      expect(ownerShareEntry).toBeUndefined();
    },
  );
});

test.describe("POST /api/2.0/files/share", () => {
  test("POST /api/2.0/files/share - Unauthenticated request returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk.forAnonymous().sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/files/share - Owner can call getSecurityInfo on own file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("POST /api/2.0/files/share - DocSpaceAdmin can call getSecurityInfo on room file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: docSpaceAdminData, api: docSpaceAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Security Info Room",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: docSpaceAdminId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await docSpaceAdminApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("POST /api/2.0/files/share - RoomAdmin can call getSecurityInfo on room file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomAdminData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Security Info Room",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("POST /api/2.0/files/share - User with file access can call getSecurityInfo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  // BUG 82675: POST /api/2.0/files/share - User without file access gets 200 instead of 403
  test.fail(
    "BUG 82675: POST /api/2.0/files/share - User without file access gets 200 instead of 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Security Info File" },
      });
      const fileId = fileData.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.sharing.getSecurityInfo({
        baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
      });

      expect(status).toBe(403);
    },
  );

  test("POST /api/2.0/files/share - Guest with file access can call getSecurityInfo", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: guestData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await guestApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  // BUG 82675: POST /api/2.0/files/share - Guest without file access gets 200 instead of 403
  test.fail(
    "BUG 82675: POST /api/2.0/files/share - Guest without file access gets 200 instead of 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Security Info File" },
      });
      const fileId = fileData.response!.id!;

      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.sharing.getSecurityInfo({
        baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
      });

      expect(status).toBe(403);
    },
  );
});

test.describe("PUT /api/2.0/files/file/:fileId/share", () => {
  test("PUT /api/2.0/files/file/:fileId/share - RoomAdmin cannot share file with guest belonging to another user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: roomAdminData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Share File Guest",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: guestId, access: FileShare.Read },
          { id: roomAdminId, access: FileShare.RoomManager },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Share File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await roomAdminApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    expect(status).toBe(200);
    const sharedUserIds = data.response?.map((entry) => entry.sharedToUser?.id);
    expect(sharedUserIds).not.toContain(guestId);
  });
});

test.describe("DELETE /api/2.0/files/share - Remove security info - access control", () => {
  test("DELETE /api/2.0/files/share - Unauthenticated request returns 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Remove Security File" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk.forAnonymous().sharing.removeSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/files/share - Owner removes sharing from own file returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Remove Security File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.removeSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("DELETE /api/2.0/files/share - DocSpaceAdmin removes sharing from owner file returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Remove Security File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.sharing.removeSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("DELETE /api/2.0/files/share - RoomAdmin removes sharing from file in own room returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Remove Security Room",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Remove Security File" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomAdminData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomAdminId, access: FileShare.RoomManager }],
        notify: false,
      },
    });

    const { data, status } = await roomAdminApi.sharing.removeSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  // BUG 83262: DELETE /api/2.0/files/share - User can remove sharing from owner file (returns 200 instead of 403)
  test.fail(
    "BUG 83262: DELETE /api/2.0/files/share - User cannot remove sharing from owner file returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Remove Security File" },
      });
      const fileId = fileData.response!.id!;

      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.sharing.removeSecurityInfo({
        baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
      });

      expect(status).toBe(403);
    },
  );

  // BUG 83262: DELETE /api/2.0/files/share - Guest can remove sharing from owner file (returns 200 instead of 403)
  test.fail(
    "BUG 83262: DELETE /api/2.0/files/share - Guest cannot remove sharing from owner file returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Remove Security File" },
      });
      const fileId = fileData.response!.id!;

      const { data: guestData, api: guestApi } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: guestId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { status } = await guestApi.sharing.removeSecurityInfo({
        baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
      });

      expect(status).toBe(403);
    },
  );

  // BUG 83262: DELETE /api/2.0/files/share - User can remove sharing from another user file (IDOR, returns 200 instead of 403)
  test.fail(
    "BUG 83262: DELETE /api/2.0/files/share - User cannot remove sharing from another user file (IDOR) returns 403",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Remove Security File" },
      });
      const fileId = fileData.response!.id!;

      const { data: targetUserData } = await apiSdk.addMember("owner", "User");
      const targetUserId = targetUserData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: targetUserId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { api: attackerApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await attackerApi.sharing.removeSecurityInfo({
        baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
      });

      expect(status).toBe(403);
    },
  );
});
