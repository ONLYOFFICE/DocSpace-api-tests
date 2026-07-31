import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/files/share", () => {
  test.fail(
    "BUG 80956: POST /api/2.0/files/share - Guest should not see groups field in getSecurityInfo response",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;

      const { data: guestData, api: guestApi } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
          members: [ownerId, userId],
        },
      });

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Sharing Room",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Sharing File.docx" },
      });
      const fileId = fileData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: guestId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await guestApi.sharing.getSecurityInfo({
        baseBatchRequestDto: {
          fileIds: [fileId as unknown as object],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();

      for (const entry of data.response ?? []) {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        expect(sharedToUser?.["groups"]).toBeUndefined();
      }
    },
  );

  test("POST /api/2.0/files/share - Returns 200 and non-empty response for single fileId", async ({
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
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/share - Returns 200 and non-empty response for single folderId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Security Info Room",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { folderIds: [roomId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/share - Returns 200 for multiple fileIds in one request", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData1 } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File 1" },
    });
    const fileId1 = fileData1.response!.id!;

    const { data: fileData2 } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File 2" },
    });
    const fileId2 = fileData2.response!.id!;

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: {
        fileIds: [fileId1 as unknown as object, fileId2 as unknown as object],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/share - Returns 200 when fileIds and folderIds are combined", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Security Info Room",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: {
        fileIds: [fileId as unknown as object],
        folderIds: [roomId as unknown as object],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBeDefined();
  });

  test("POST /api/2.0/files/share - Owner entry has isOwner set to true", async ({
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
    const ownerEntry = data.response!.find((entry) => entry.isOwner === true);
    expect(ownerEntry).toBeDefined();
  });

  test("POST /api/2.0/files/share - Shared user entry appears with correct access level", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
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

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeDefined();
    expect(userEntry!.access).toBe(FileShare.Read);
  });

  test("POST /api/2.0/files/share - Shared group entry appears in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: userId,
        members: [userId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const groupEntry = data.response!.find((entry) => {
      const sharedToGroup = entry.sharedToGroup as
        | Record<string, unknown>
        | undefined;
      return sharedToGroup?.["id"] === groupId;
    });
    expect(groupEntry).toBeDefined();
  });

  test("POST /api/2.0/files/share - Each entry contains boolean control fields", async ({
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
    expect(data.response!.length).toBeGreaterThan(0);

    for (const entry of data.response!) {
      expect(typeof entry.isLocked).toBe("boolean");
      expect(typeof entry.isOwner).toBe("boolean");
      expect(typeof entry.canEditAccess).toBe("boolean");
      expect(typeof entry.canEditInternal).toBe("boolean");
      expect(typeof entry.canEditDenyDownload).toBe("boolean");
      expect(typeof entry.canEditExpirationDate).toBe("boolean");
      expect(typeof entry.canRevoke).toBe("boolean");
    }
  });

  test("POST /api/2.0/files/share - Each entry has valid subjectType value", async ({
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
    expect(data.response!.length).toBeGreaterThan(0);

    const validSubjectTypes = [0, 1, 2, 3, 4];
    for (const entry of data.response!) {
      expect(validSubjectTypes).toContain(entry.subjectType);
    }
  });

  test("POST /api/2.0/files/share - User entry has subjectType 0", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
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

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeDefined();
    expect(userEntry!.subjectType).toBe(0);
  });

  test("POST /api/2.0/files/share - Group entry has subjectType 2", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: userId,
        members: [userId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const groupEntry = data.response!.find((entry) => {
      const sharedToGroup = entry.sharedToGroup as
        | Record<string, unknown>
        | undefined;
      return sharedToGroup?.["id"] === groupId;
    });
    expect(groupEntry).toBeDefined();
    expect(groupEntry!.subjectType).toBe(2);
  });

  test("POST /api/2.0/files/share - Shared user entry has canEditAccess set to true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
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

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeDefined();
    expect(userEntry!.canEditAccess).toBe(true);
  });

  test("POST /api/2.0/files/share - Owner entry has canRevoke set to false", async ({
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

    const ownerEntry = data.response!.find((entry) => entry.isOwner === true);
    expect(ownerEntry).toBeDefined();
    expect(ownerEntry!.canRevoke).toBe(false);
  });

  test("POST /api/2.0/files/share - sharedToUser contains user id and display name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
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

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeDefined();

    const sharedToUser = userEntry!.sharedToUser as Record<string, unknown>;
    expect(sharedToUser["id"]).toBe(userId);
    expect(typeof sharedToUser["displayName"]).toBe("string");
    expect((sharedToUser["displayName"] as string).length).toBeGreaterThan(0);
  });

  test("POST /api/2.0/files/share - sharedToGroup contains group id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: userId,
        members: [userId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const groupEntry = data.response!.find((entry) => {
      const sharedToGroup = entry.sharedToGroup as
        | Record<string, unknown>
        | undefined;
      return sharedToGroup?.["id"] === groupId;
    });
    expect(groupEntry).toBeDefined();

    const sharedToGroup = groupEntry!.sharedToGroup as unknown as Record<
      string,
      unknown
    >;
    expect(sharedToGroup["id"]).toBe(groupId);
  });

  test("POST /api/2.0/files/share - After changing access level response reflects new level", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
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

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Comment }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeDefined();
    expect(userEntry!.access).toBe(FileShare.Comment);
  });

  test("POST /api/2.0/files/share - All shared users appear in response when file shared with multiple users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const userId1 = userData1.response!.id!;

    const { data: userData2 } = await apiSdk.addMember("owner", "User");
    const userId2 = userData2.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [
          { shareTo: userId1, access: FileShare.Read },
          { shareTo: userId2, access: FileShare.Comment },
        ],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const sharedUserIds = data
      .response!.filter((entry) => entry.sharedToUser !== undefined)
      .map((entry) => {
        const sharedToUser = entry.sharedToUser as Record<string, unknown>;
        return sharedToUser["id"];
      });

    expect(sharedUserIds).toContain(userId1);
    expect(sharedUserIds).toContain(userId2);
  });

  test("POST /api/2.0/files/share - Revoked access no longer appears in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
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

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.None }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeUndefined();
  });

  test("POST /api/2.0/files/share - Returns 200 for non-existent fileId", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .sharing.getSecurityInfo({
        baseBatchRequestDto: { fileIds: [999999999 as unknown as object] },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("POST /api/2.0/files/share - Locked file entry has isLocked set to true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.lockFile({
      fileId,
      lockFileParameters: { lockFile: true },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const ownerEntry = data.response!.find((entry) => entry.isOwner === true);
    expect(ownerEntry).toBeDefined();
    expect(ownerEntry!.isLocked).toBe(true);
  });

  test("POST /api/2.0/files/share - Shared user entry has isOwner set to false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
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

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeDefined();
    expect(userEntry!.isOwner).toBe(false);
  });

  test("POST /api/2.0/files/share - Returns 200 with empty request body", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .sharing.getSecurityInfo({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("POST /api/2.0/files/share - Returns 200 and empty response for empty fileIds array", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .sharing.getSecurityInfo({
        baseBatchRequestDto: { fileIds: [] },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toStrictEqual([]);
  });
});
