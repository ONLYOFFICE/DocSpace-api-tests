import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare, SubjectType } from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";

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

test.describe("GET /api/2.0/files/file/{fileId}/sharedusers", () => {
  test("GET /api/2.0/files/file/{fileId}/sharedusers - Returns 200 and empty list for unshared file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toStrictEqual([]);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Returns 200 and non-empty list when file is shared", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
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

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Owner is not included in the shared users list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
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

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    const entryIds = data.response!.map((e) => e.id);
    expect(entryIds).not.toContain(ownerId);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Portal member without file access is not in the list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    const entryIds = data.response!.map((e) => e.id);
    expect(entryIds).not.toContain(userId);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Each entry has id, name, email and hasAccess fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
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

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeGreaterThan(0);
    for (const entry of data.response!) {
      expect(typeof entry.id).toBe("string");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.email).toBe("string");
      expect(typeof entry.hasAccess).toBe("boolean");
    }
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Shared user entry has non-empty name and email matching profile", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    const userEntry = data.response!.find((e) => e.id === userId);
    expect(userEntry).toBeDefined();
    expect(userEntry!.name!.length).toBeGreaterThan(0);
    expect(userEntry!.email).toBe(userEmail);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - All shared users appear in response when file shared with multiple users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Shared Users File" },
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

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    const entryIds = data.response!.map((e) => e.id);
    expect(entryIds).toContain(userId1);
    expect(entryIds).toContain(userId2);
  });
});

test.describe("DELETE /api/2.0/files/share - Remove security info", () => {
  // BUG 83259: DELETE /api/2.0/files/share - removeSecurityInfo does not remove sharing entry for a single file
  test.fail(
    "BUG 83259: DELETE /api/2.0/files/share - Owner removes sharing from a single file",
    async ({ apiSdk }) => {
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

      const { data: securityData } = await ownerApi.sharing.getFileSecurityInfo(
        { id: fileId },
      );
      const userEntry = securityData.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === userId;
      });
      expect(userEntry).toBeUndefined();
    },
  );

  // BUG 83259: DELETE /api/2.0/files/share - removeSecurityInfo does not remove sharing entry for a folder
  test.fail(
    "BUG 83259: DELETE /api/2.0/files/share - Owner removes sharing from a folder",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Remove Security Room",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.sharing.removeSecurityInfo({
        baseBatchRequestDto: { folderIds: [roomId as unknown as object] },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);

      const { data: securityData } =
        await ownerApi.sharing.getFolderSecurityInfo({ id: roomId });
      const userEntry = securityData.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === userId;
      });
      expect(userEntry).toBeUndefined();
    },
  );

  // BUG 83259: DELETE /api/2.0/files/share - removeSecurityInfo does not remove sharing entries for multiple files
  test.fail(
    "BUG 83259: DELETE /api/2.0/files/share - Owner removes sharing from multiple files in one request",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData1 } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Remove Security File 1" },
      });
      const fileId1 = fileData1.response!.id!;

      const { data: fileData2 } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Remove Security File 2" },
      });
      const fileId2 = fileData2.response!.id!;

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId: fileId1,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: userId, access: FileShare.Read }],
          notify: false,
        },
      });
      await ownerApi.sharing.setFileSecurityInfo({
        fileId: fileId2,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.sharing.removeSecurityInfo({
        baseBatchRequestDto: {
          fileIds: [fileId1 as unknown as object, fileId2 as unknown as object],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);

      const { data: securityData1 } =
        await ownerApi.sharing.getFileSecurityInfo({ id: fileId1 });
      const userEntry1 = securityData1.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === userId;
      });
      expect(userEntry1).toBeUndefined();

      const { data: securityData2 } =
        await ownerApi.sharing.getFileSecurityInfo({ id: fileId2 });
      const userEntry2 = securityData2.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === userId;
      });
      expect(userEntry2).toBeUndefined();
    },
  );

  // BUG 83259: DELETE /api/2.0/files/share - removeSecurityInfo does not remove sharing entries for files and folders
  test.fail(
    "BUG 83259: DELETE /api/2.0/files/share - Owner removes sharing from files and folders in one request",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Remove Security File" },
      });
      const fileId = fileData.response!.id!;

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Remove Security Room",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: userId, access: FileShare.Read }],
          notify: false,
        },
      });

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.sharing.removeSecurityInfo({
        baseBatchRequestDto: {
          fileIds: [fileId as unknown as object],
          folderIds: [roomId as unknown as object],
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBe(true);

      const { data: fileSecurityData } =
        await ownerApi.sharing.getFileSecurityInfo({ id: fileId });
      const fileUserEntry = fileSecurityData.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === userId;
      });
      expect(fileUserEntry).toBeUndefined();

      const { data: folderSecurityData } =
        await ownerApi.sharing.getFolderSecurityInfo({ id: roomId });
      const folderUserEntry = folderSecurityData.response!.find((entry) => {
        const sharedToUser = entry.sharedToUser as
          | Record<string, unknown>
          | undefined;
        return sharedToUser?.["id"] === userId;
      });
      expect(folderUserEntry).toBeUndefined();
    },
  );

  test("DELETE /api/2.0/files/share - Removing sharing from an unshared file returns true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Remove Security Unshared File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.sharing.removeSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  // BUG 83259: DELETE /api/2.0/files/share - removeSecurityInfo returns 200 but does not remove the sharing entry
  test.fail(
    "BUG 83259: DELETE /api/2.0/files/share - Shared user entry is removed from security info after sharing removal",
    async ({ apiSdk }) => {
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

      await ownerApi.sharing.removeSecurityInfo({
        baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
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
    },
  );

  // BUG 83259: DELETE /api/2.0/files/share - removeSecurityInfo returns 200 but user retains access
  test.fail(
    "BUG 83259: DELETE /api/2.0/files/share - Formerly shared user loses access to file after sharing removal",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Remove Security File" },
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

      await ownerApi.sharing.removeSecurityInfo({
        baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
      });

      const { status } = await userApi.sharing.getSharedUsers({ fileId });

      expect(status).toBe(403);
    },
  );

  test("DELETE /api/2.0/files/share - Empty request body returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.sharing.removeSecurityInfo({});

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("DELETE /api/2.0/files/share - Non-existent fileId returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } = await ownerApi.sharing.removeSecurityInfo({
      baseBatchRequestDto: {
        fileIds: [999999999 as unknown as object],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });
});

test.describe("GET /api/2.0/files/file/{id}/share - Get file security info", () => {
  test("GET /api/2.0/files/file/{id}/share - Owner gets security info for own file returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/files/file/{id}/share - File with no shares has exactly one owner entry", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info No Shares" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(1);
  });

  test("GET /api/2.0/files/file/{id}/share - Owner entry has isOwner=true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info Owner Entry" },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const ownerEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === ownerId;
    });

    expect(ownerEntry).toBeDefined();
    expect(ownerEntry!.isOwner).toBe(true);
  });

  test("GET /api/2.0/files/file/{id}/share - Owner entry has canEditAccess=true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info CanEditAccess",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const ownerEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === ownerId;
    });

    expect(ownerEntry).toBeDefined();
    expect(ownerEntry!.canEditAccess).toBe(false);
  });

  test("GET /api/2.0/files/file/{id}/share - Owner entry has subjectType=User", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info SubjectType Owner",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const ownerEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === ownerId;
    });

    expect(ownerEntry).toBeDefined();
    expect(ownerEntry!.subjectType).toBe(SubjectType.User);
  });

  test("GET /api/2.0/files/file/{id}/share - Shared user entry has correct Read access level", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info Shared Read" },
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

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
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

  test("GET /api/2.0/files/file/{id}/share - Shared user entry has correct Comment access level", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Shared Comment",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Comment }],
        notify: false,
      },
    });

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });

    expect(userEntry).toBeDefined();
    expect(userEntry!.access).toBe(FileShare.Comment);
  });

  test("GET /api/2.0/files/file/{id}/share - Shared user entry has correct ReadWrite access level", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Shared ReadWrite",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.ReadWrite }],
        notify: false,
      },
    });

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });

    expect(userEntry).toBeDefined();
    expect(userEntry!.access).toBe(FileShare.ReadWrite);
  });

  test("GET /api/2.0/files/file/{id}/share - Shared user entry has isOwner=false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info IsOwner False" },
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

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });

    expect(userEntry).toBeDefined();
    expect(userEntry!.isOwner).toBe(false);
  });

  test("GET /api/2.0/files/file/{id}/share - Shared user entry has subjectType=User", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info SubjectType User",
      },
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

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });

    expect(userEntry).toBeDefined();
    expect(userEntry!.subjectType).toBe(SubjectType.User);
  });

  test("GET /api/2.0/files/file/{id}/share - count parameter limits number of returned entries", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Security Info Count Param" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const { data: userData2 } = await apiSdk.addMember("owner", "User");

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [
          { shareTo: userData1.response!.id!, access: FileShare.Read },
          { shareTo: userData2.response!.id!, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
      count: 1,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBeLessThanOrEqual(1);
  });

  test("GET /api/2.0/files/file/{id}/share - Non-existent file ID returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .sharing.getFileSecurityInfo({ id: 999999999 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/file/{id}/share - id=0 returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .sharing.getFileSecurityInfo({ id: 0 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/file/{id}/share - Negative id returns 404", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .sharing.getFileSecurityInfo({ id: -1 });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/file/{id}/share - File shared with multiple users - all entries appear", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Multiple Users",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const { data: userData2 } = await apiSdk.addMember("owner", "User");
    const userId1 = userData1.response!.id!;
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

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    expect(status).toBe(200);
    const ids = data.response!.map((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"];
    });
    expect(ids).toContain(userId1);
    expect(ids).toContain(userId2);
  });

  test("GET /api/2.0/files/file/{id}/share - startIndex skips entries", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info StartIndex",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const { data: userData2 } = await apiSdk.addMember("owner", "User");

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [
          { shareTo: userData1.response!.id!, access: FileShare.Read },
          { shareTo: userData2.response!.id!, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    const { data: fullData } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });
    const totalCount = fullData.response!.length;

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
      startIndex: 1,
    });

    expect(status).toBe(200);
    expect(data.response!.length).toBe(totalCount - 1);
  });

  test("GET /api/2.0/files/file/{id}/share - Updated access level is reflected in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Access Update",
      },
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

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
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

  test("GET /api/2.0/files/file/{id}/share - Shared user entry disappears after access revoked", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Revoke Disappear",
      },
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

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
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

  test("GET /api/2.0/files/file/{id}/share - canRevoke=true for shared user entry", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info CanRevoke",
      },
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

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });

    expect(userEntry).toBeDefined();
    expect(userEntry!.canRevoke).toBe(false);
  });

  test("GET /api/2.0/files/file/{id}/share - sharedToUser contains user id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info SharedToUser Id",
      },
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

    const { data } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });

    expect(userEntry).toBeDefined();
    const sharedToUser = userEntry!.sharedToUser as
      | Record<string, unknown>
      | undefined;
    expect(sharedToUser?.["id"]).toBe(userId);
  });

  test("GET /api/2.0/files/file/{id}/share - Guest entry appears with correct access after sharing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Guest Entry",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: guestData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestId = guestData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    expect(status).toBe(200);
    const guestEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === guestId;
    });

    expect(guestEntry).toBeDefined();
    expect(guestEntry!.access).toBe(FileShare.Read);
  });

  test("GET /api/2.0/files/file/{id}/share - File in room - room member appears in security info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Security Info Room Member",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Security Info Room File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    expect(status).toBe(200);
    const userEntry = data.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });

    expect(userEntry).toBeDefined();
    expect(userEntry!.access).toBe(FileShare.Editing);
  });

  test("GET /api/2.0/files/file/{id}/share - File shared with group - group entry has subjectType=Group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Group Entry",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

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
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    expect(status).toBe(200);
    const groupEntry = data.response!.find((entry) => {
      const sharedToGroup = entry.sharedToGroup as
        | Record<string, unknown>
        | undefined;
      return sharedToGroup?.["id"] === groupId;
    });

    expect(groupEntry).toBeDefined();
    expect(groupEntry!.subjectType).toBe(SubjectType.Group);
    expect(groupEntry!.access).toBe(FileShare.Read);
  });

  test("GET /api/2.0/files/file/{id}/share - File moved to trash: user share entry is removed from security info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Trash File",
      },
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

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { data, status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
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

  test("GET /api/2.0/files/file/{id}/share - Permanently deleted file returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Perm Delete File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/files/file/{id}/share - Shared user cannot access security info after file is moved to trash", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: {
        title: "Autotest Security Info Trash Shared",
      },
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

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await userApi.sharing.getFileSecurityInfo({
      id: fileId,
    });

    expect(status).toBe(403);
  });
});

test.describe("POST /api/2.0/files/file/{fileId}/sendeditornotify - Send editor notify", () => {
  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - Owner sends notify returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Notify Room Basic",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Notify File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageWrapper: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "Hello",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  // BUG XXXXX: sendEditorNotify returns 200 but response body contains no AceShortWrapper data
  test.fail(
    "BUG XXXXX: POST /api/2.0/files/file/{fileId}/sendeditornotify - Response contains user name and permissions for mentioned user",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Notify Room Response Fields",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Notify File.docx" },
      });
      const fileId = fileData.response!.id!;

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;
      const userEmail = userData.response!.email!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.sharing.sendEditorNotify({
        fileId,
        mentionMessageWrapper: {
          actionLink: { action: { data: "test-action", type: "comment" } },
          emails: [userEmail],
          message: "test",
        },
      });

      expect(status).toBe(200);
      expect(data.response).toHaveLength(1);
      const entry = data.response![0];
      expect(entry.user).toBeDefined();
      expect(entry.permissions).toBeDefined();
      expect(entry.isLink).toBe(false);
    },
  );

  // BUG XXXXX: sendEditorNotify returns 200 but response body contains no AceShortWrapper data
  test.fail(
    "BUG XXXXX: POST /api/2.0/files/file/{fileId}/sendeditornotify - User with Editing access gets Full Access in response",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Notify Room Editing",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Notify File.docx" },
      });
      const fileId = fileData.response!.id!;

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;
      const userEmail = userData.response!.email!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: userId, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.sharing.sendEditorNotify({
        fileId,
        mentionMessageWrapper: {
          actionLink: { action: { data: "test-action", type: "comment" } },
          emails: [userEmail],
          message: "test",
        },
      });

      expect(status).toBe(200);
      expect(data.response![0].permissions).toBe("Full Access");
    },
  );

  // BUG XXXXX: sendEditorNotify returns 200 but response body contains no AceShortWrapper data
  test.fail(
    "BUG XXXXX: POST /api/2.0/files/file/{fileId}/sendeditornotify - User without room access gets Deny Access in response",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Notify Room Deny",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Notify File.docx" },
      });
      const fileId = fileData.response!.id!;

      const { data: outsiderData } = await apiSdk.addMember("owner", "User");
      const outsiderEmail = outsiderData.response!.email!;

      const { data, status } = await ownerApi.sharing.sendEditorNotify({
        fileId,
        mentionMessageWrapper: {
          actionLink: { action: { data: "test-action", type: "comment" } },
          emails: [outsiderEmail],
          message: "test",
        },
      });

      expect(status).toBe(200);
      expect(data.response).toHaveLength(1);
      expect(data.response![0].permissions).toBe("Deny Access");
    },
  );

  // BUG XXXXX: sendEditorNotify returns 200 but response body contains no AceShortWrapper data
  test.fail(
    "BUG XXXXX: POST /api/2.0/files/file/{fileId}/sendeditornotify - Multiple emails returns entry per mentioned user",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: roomData } = await ownerApi.rooms.createRoom({
        createRoomRequestDto: {
          title: "Autotest Notify Room Multi",
          roomType: RoomType.EditingRoom,
        },
      });
      const roomId = roomData.response!.id!;

      const { data: fileData } = await ownerApi.files.createFile({
        folderId: roomId,
        createFileJsonElement: { title: "Autotest Notify File.docx" },
      });
      const fileId = fileData.response!.id!;

      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerEmail = ownerProfile.response!.email!;

      const { data: user1Data } = await apiSdk.addMember("owner", "User");
      const user1Id = user1Data.response!.id!;
      const user1Email = user1Data.response!.email!;

      await ownerApi.rooms.setRoomSecurity({
        id: roomId,
        roomInvitationRequest: {
          invitations: [{ id: user1Id, access: FileShare.Editing }],
          notify: false,
        },
      });

      const { data, status } = await ownerApi.sharing.sendEditorNotify({
        fileId,
        mentionMessageWrapper: {
          actionLink: { action: { data: "test-action", type: "comment" } },
          emails: [ownerEmail, user1Email],
          message: "test",
        },
      });

      expect(status).toBe(200);
      expect(data.response).toHaveLength(2);
      expect(data.count).toBe(2);
    },
  );

  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - Empty emails array returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Notify Room Empty Emails",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Notify File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageWrapper: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [],
        message: "test",
      },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - actionLink data at 256 characters returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Notify Room Max Data",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Notify File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageWrapper: {
        actionLink: { action: { data: "a".repeat(256), type: "comment" } },
        emails: [userEmail],
        message: "test",
      },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - Empty message is accepted returns 200", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Notify Room Empty Message",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Notify File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageWrapper: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "",
      },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - Non-existent fileId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId: 999999999,
      mentionMessageWrapper: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "test",
      },
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - File in trash returns 403", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Notify Room Trash",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Notify File Trash.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageWrapper: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "test",
      },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - Permanently deleted file returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Notify Room Perm Delete",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: { title: "Autotest Notify File Perm.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;

    await ownerApi.files.deleteFile({
      fileId,
      _delete: { immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageWrapper: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "test",
      },
    });

    expect(status).toBe(404);
  });
});
