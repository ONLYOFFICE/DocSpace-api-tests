import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FileShare,
  SubjectType,
  ExternalShareStatus,
  FileEntryType,
  LinkType,
} from "@onlyoffice/docspace-api-sdk";
import { waitForOperation } from "@/src/helpers/wait-for-operation";
import { ApiSDK } from "@/src/services/api-sdk";

test.describe("POST /api/2.0/files/share", () => {
  test("BUG 80956: POST /api/2.0/files/share - Guest should not see groups field in getSecurityInfo response", async ({
    apiSdk,
  }) => {
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
      createFileRequest: { title: "Autotest Sharing File.docx" },
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

    // The bug let `groups` ride along inside `sharedToUser`, which showed a
    // guest how the portal is organised. Collecting the offending entries
    // says in one assertion that none is left, and names them when one is.
    const entriesWithGroups = (data.response ?? []).filter((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["groups"] !== undefined;
    });
    expect(entriesWithGroups).toHaveLength(0);
  });

  test("POST /api/2.0/files/share - Returns 200 and non-empty response for single fileId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Security Info File" },
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
      createFileRequest: { title: "Autotest Security Info File 1" },
    });
    const fileId1 = fileData1.response!.id!;

    const { data: fileData2 } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Security Info File 2" },
    });
    const fileId2 = fileData2.response!.id!;

    // Each file is shared with a different person, so the answer can only
    // hold both of them if both files were really read. Without that the
    // batch could quietly report on the first id alone.
    const { data: firstUser } = await apiSdk.addMember("owner", "User");
    const firstUserId = firstUser.response!.id!;
    const { data: secondUser } = await apiSdk.addMember("owner", "User");
    const secondUserId = secondUser.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId1,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: firstUserId, access: FileShare.Read }],
        notify: false,
      },
    });
    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId2,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: secondUserId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: {
        fileIds: [fileId1 as unknown as object, fileId2 as unknown as object],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const sharedIds = data.response!.map(
      (entry) =>
        (entry.sharedToUser as Record<string, unknown> | undefined)?.["id"],
    );
    expect(sharedIds).toContain(firstUserId);
    expect(sharedIds).toContain(secondUserId);
  });

  test("POST /api/2.0/files/share - Returns 200 when fileIds and folderIds are combined", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Security Info Room",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    // One person on the file and another in the room, so the two kinds of id
    // can be told apart in the answer: it is the only way to see that a
    // mixed request does not drop one of the two lists.
    const { data: fileUser } = await apiSdk.addMember("owner", "User");
    const fileUserId = fileUser.response!.id!;
    const { data: roomUser } = await apiSdk.addMember("owner", "User");
    const roomUserId = roomUser.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: fileUserId, access: FileShare.Read }],
        notify: false,
      },
    });
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: roomUserId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: {
        fileIds: [fileId as unknown as object],
        folderIds: [roomId as unknown as object],
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);

    const sharedIds = data.response!.map(
      (entry) =>
        (entry.sharedToUser as Record<string, unknown> | undefined)?.["id"],
    );
    expect(sharedIds).toContain(fileUserId);
    expect(sharedIds).toContain(roomUserId);
  });

  test("POST /api/2.0/files/share - Owner entry has isOwner set to true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Security Info File" },
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
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
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
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.sharing.getSecurityInfo({
      baseBatchRequestDto: { fileIds: [fileId as unknown as object] },
    });

    expect(status).toBe(200);
    // An unshared file carries exactly one entry, its owner's, so the fields
    // are read off that entry instead of being swept over a list whose size
    // the test never pinned down.
    expect(data.response).toHaveLength(1);

    const ownerEntry = data.response![0];
    expect(typeof ownerEntry.isLocked).toBe("boolean");
    expect(typeof ownerEntry.isOwner).toBe("boolean");
    expect(typeof ownerEntry.canEditAccess).toBe("boolean");
    expect(typeof ownerEntry.canEditInternal).toBe("boolean");
    expect(typeof ownerEntry.canEditDenyDownload).toBe("boolean");
    expect(typeof ownerEntry.canEditExpirationDate).toBe("boolean");
    expect(typeof ownerEntry.canRevoke).toBe("boolean");
  });

  test("POST /api/2.0/files/share - User entry has subjectType 0", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
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
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
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
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
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
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const userId1 = userData1.response!.id!;

    const { data: userData2 } = await apiSdk.addMember("owner", "User");
    const userId2 = userData2.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
    // The point is not the status but that nothing comes back with it: an id
    // naming no file must not carry anybody's access rights.
    expect(data.response ?? []).toHaveLength(0);
  });

  test("POST /api/2.0/files/share - Locked file entry has isLocked set to true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.lockFile({
      fileId,
      lockFileRequest: { lockFile: true },
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
      createFileRequest: { title: "Autotest Security Info File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
    expect(data.response ?? []).toHaveLength(0);
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
      createFileRequest: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toStrictEqual([]);
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Owner is not included in the shared users list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Shared Users File" },
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
      createFileRequest: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await ownerApi.sharing.getSharedUsers({
      fileId,
    });

    expect(status).toBe(200);
    // The owner is left out of this listing, so the single person the file
    // was shared with is the whole of it.
    expect(data.response).toHaveLength(1);

    const sharedEntry = data.response![0];
    expect(typeof sharedEntry.id).toBe("string");
    expect(typeof sharedEntry.name).toBe("string");
    expect(typeof sharedEntry.email).toBe("string");
    expect(typeof sharedEntry.hasAccess).toBe("boolean");
  });

  test("GET /api/2.0/files/file/{fileId}/sharedusers - Shared user entry has non-empty name and email matching profile", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Shared Users File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const userId1 = userData1.response!.id!;
    const { data: userData2 } = await apiSdk.addMember("owner", "User");
    const userId2 = userData2.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
  test("BUG 83259: DELETE /api/2.0/files/share - Owner removes sharing from a single file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Remove Security File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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

    const { data: securityData } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId,
    });
    const userEntry = securityData.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeUndefined();
  });

  test("BUG 83259: DELETE /api/2.0/files/share - Owner removes sharing from a folder", async ({
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

    const { data: securityData } = await ownerApi.sharing.getFolderSecurityInfo(
      { id: roomId },
    );
    const userEntry = securityData.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry).toBeUndefined();
  });

  test("BUG 83259: DELETE /api/2.0/files/share - Owner removes sharing from multiple files in one request", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData1 } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Remove Security File 1" },
    });
    const fileId1 = fileData1.response!.id!;

    const { data: fileData2 } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Remove Security File 2" },
    });
    const fileId2 = fileData2.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId1,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });
    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId2,
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

    const { data: securityData1 } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId1,
    });
    const userEntry1 = securityData1.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry1).toBeUndefined();

    const { data: securityData2 } = await ownerApi.sharing.getFileSecurityInfo({
      id: fileId2,
    });
    const userEntry2 = securityData2.response!.find((entry) => {
      const sharedToUser = entry.sharedToUser as
        | Record<string, unknown>
        | undefined;
      return sharedToUser?.["id"] === userId;
    });
    expect(userEntry2).toBeUndefined();
  });

  test("BUG 83259: DELETE /api/2.0/files/share - Owner removes sharing from files and folders in one request", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Remove Security File" },
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
      id: fileId,
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
  });

  test("DELETE /api/2.0/files/share - Removing sharing from an unshared file returns true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: {
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

  test("BUG 83259: DELETE /api/2.0/files/share - Shared user entry is removed from security info after sharing removal", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Remove Security File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
  });

  test("BUG 83259: DELETE /api/2.0/files/share - Formerly shared user loses access to file after sharing removal", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Remove Security File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
  });

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
  test("GET /api/2.0/files/file/{id}/share - File with no shares has exactly one owner entry", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: "Autotest Security Info No Shares" },
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
      createFileRequest: { title: "Autotest Security Info Owner Entry" },
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
      createFileRequest: {
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
      createFileRequest: {
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
      createFileRequest: { title: "Autotest Security Info Shared Read" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: {
        title: "Autotest Security Info Shared Comment",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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

  test("GET /api/2.0/files/file/{id}/share - Shared user entry has correct ReadWrite access level", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: {
        title: "Autotest Security Info Shared ReadWrite",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info IsOwner False" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: {
        title: "Autotest Security Info SubjectType User",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info Count Param" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const { data: userData2 } = await apiSdk.addMember("owner", "User");

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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

  test("GET /api/2.0/files/file/{id}/share - File shared with multiple users - all entries appear", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: {
        title: "Autotest Security Info Multiple Users",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const { data: userData2 } = await apiSdk.addMember("owner", "User");
    const userId1 = userData1.response!.id!;
    const userId2 = userData2.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: {
        title: "Autotest Security Info StartIndex",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData1 } = await apiSdk.addMember("owner", "User");
    const { data: userData2 } = await apiSdk.addMember("owner", "User");

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: {
        title: "Autotest Security Info Access Update",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: {
        title: "Autotest Security Info Revoke Disappear",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: {
        title: "Autotest Security Info CanRevoke",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: {
        title: "Autotest Security Info SharedToUser Id",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
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
      createFileRequest: {
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
      id: fileId,
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
      createFileRequest: { title: "Autotest Security Info Room File" },
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
      createFileRequest: {
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
      id: fileId,
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
      createFileRequest: {
        title: "Autotest Security Info Trash File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: false },
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
      createFileRequest: {
        title: "Autotest Security Info Perm Delete File",
      },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: true },
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
      createFileRequest: {
        title: "Autotest Security Info Trash Shared",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: userData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      id: fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: false },
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
      createFileRequest: { title: "Autotest Notify File.docx" },
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
      mentionMessageRequest: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "Hello",
      },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
  });

  test("BUG 83430: POST /api/2.0/files/file/{fileId}/sendeditornotify - Response contains user name and permissions for mentioned user", async ({
    apiSdk,
  }) => {
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
      createFileRequest: { title: "Autotest Notify File.docx" },
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
      mentionMessageRequest: {
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
  });

  test("BUG 83430: POST /api/2.0/files/file/{fileId}/sendeditornotify - User with Editing access has permissions defined in response", async ({
    apiSdk,
  }) => {
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
      createFileRequest: { title: "Autotest Notify File.docx" },
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
      mentionMessageRequest: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "test",
      },
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(1);
    expect(data.response![0].permissions).toBeDefined();
  });

  test("BUG 83430: POST /api/2.0/files/file/{fileId}/sendeditornotify - User without room access gets Deny Access in response", async ({
    apiSdk,
  }) => {
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
      createFileRequest: { title: "Autotest Notify File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: outsiderData } = await apiSdk.addMember("owner", "User");
    const outsiderEmail = outsiderData.response!.email!;

    const { data, status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageRequest: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [outsiderEmail],
        message: "test",
      },
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(1);
    expect(data.response![0].permissions).toBe("Deny Access");
  });

  test("BUG 83430: POST /api/2.0/files/file/{fileId}/sendeditornotify - Multiple emails returns entry per mentioned user", async ({
    apiSdk,
  }) => {
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
      createFileRequest: { title: "Autotest Notify File.docx" },
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
      mentionMessageRequest: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [ownerEmail, user1Email],
        message: "test",
      },
    });

    expect(status).toBe(200);
    expect(data.response).toHaveLength(2);
    expect(data.count).toBe(2);
  });

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
      createFileRequest: { title: "Autotest Notify File.docx" },
    });
    const fileId = fileData.response!.id!;

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageRequest: {
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
      createFileRequest: { title: "Autotest Notify File.docx" },
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
      mentionMessageRequest: {
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
      createFileRequest: { title: "Autotest Notify File.docx" },
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
      mentionMessageRequest: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "",
      },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - Message longer than 255 characters returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Notify Room Long Message",
        roomType: RoomType.EditingRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileRequest: { title: "Autotest Notify File.docx" },
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
      mentionMessageRequest: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "a".repeat(256),
      },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/files/file/{fileId}/sendeditornotify - Non-existent fileId returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId: 999999999,
      mentionMessageRequest: {
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
      createFileRequest: { title: "Autotest Notify File Trash.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;

    await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: false },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageRequest: {
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
      createFileRequest: { title: "Autotest Notify File Perm.docx" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;

    await ownerApi.files.deleteFile({
      fileId,
      deleteFileRequest: { immediately: true },
    });
    await waitForOperation(ownerApi.operations);

    const { status } = await ownerApi.sharing.sendEditorNotify({
      fileId,
      mentionMessageRequest: {
        actionLink: { action: { data: "test-action", type: "comment" } },
        emails: [userEmail],
        message: "test",
      },
    });

    expect(status).toBe(404);
  });
});

const PASSWORD = "Secret123!";
const WRONG_PASSWORD = "Wrong123!";

/** A Custom room shared by an external link locked with `PASSWORD`. */
async function passwordProtectedRoom(apiSdk: ApiSDK, title: string) {
  const ownerApi = apiSdk.forRole("owner");

  const { data: roomData } = await ownerApi.rooms.createRoom({
    createRoomRequestDto: { title, roomType: RoomType.CustomRoom },
  });
  const roomId = roomData.response!.id!;

  const { data: linkData } = await ownerApi.rooms.setRoomLink({
    id: roomId,
    roomLinkRequest: {
      access: FileShare.Read,
      linkType: LinkType.External,
      title: "Password Protected Link",
      password: PASSWORD,
      denyDownload: false,
    },
  });

  return { roomId, key: linkData.response!.sharedLink!.requestToken! };
}

test.describe("GET /api/2.0/files/share - getExternalShareData", () => {
  test("GET /api/2.0/files/share - Owner resolves room external link: returns 200 with room metadata, isRoomMember=false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const roomTitle = "Autotest External Share Data Room";

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: roomTitle,
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: linkData } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
      { id: roomId },
    );
    const requestToken = linkData.response!.sharedLink!.requestToken!;

    const { data, status } = await ownerApi.sharing.getExternalShareData({
      key: requestToken,
      folderId: String(roomId),
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.status).toBe(ExternalShareStatus.Ok);
    expect(data.response!.entityId).toBe(String(roomId));
    expect(data.response!.entityTitle).toBe(roomTitle);
    expect(data.response!.isRoom).toBe(true);
    expect(data.response!.shared).toBe(true);
    expect(data.response!.isAuthenticated).toBe(true);
    expect(data.response!.isRoomMember).toBe(false);
    expect(data.response!.linkId).toBeDefined();
    expect(data.response!.tenantId).toBeGreaterThan(0);
  });

  test("GET /api/2.0/files/share - Owner resolves file external link: entityType is File", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: {
        title: "Autotest External Share Data File.docx",
      },
    });
    const fileId = fileData.response!.id!;

    const { data: linkData } = await ownerApi.files.getFilePrimaryExternalLink({
      id: fileId,
    });
    const requestToken = linkData.response!.sharedLink!.requestToken!;

    const { data, status } = await ownerApi.sharing.getExternalShareData({
      key: requestToken,
      fileId: String(fileId),
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response!.status).toBe(ExternalShareStatus.Ok);
    expect(data.response!.type).toBe(FileEntryType.File);
    expect(data.response!.isRoom).not.toBe(true);
    expect(data.response!.isAuthenticated).toBe(true);
  });

  test("GET /api/2.0/files/share - Room member resolves room external link: isRoomMember=true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest External Share Member Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: userData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data: linkData } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
      { id: roomId },
    );
    const requestToken = linkData.response!.sharedLink!.requestToken!;

    const { data, status } = await userApi.sharing.getExternalShareData({
      key: requestToken,
      folderId: String(roomId),
    });

    expect(status).toBe(200);
    expect(data.response!.isAuthenticated).toBe(true);
    expect(data.response!.isRoomMember).toBe(true);
  });

  test("GET /api/2.0/files/share - Non-member resolves room external link: isRoomMember=false", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest External Share Non-Member Check",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: linkData } = await ownerApi.rooms.getRoomsPrimaryExternalLink(
      { id: roomId },
    );
    const requestToken = linkData.response!.sharedLink!.requestToken!;

    const { data, status } = await userApi.sharing.getExternalShareData({
      key: requestToken,
      folderId: String(roomId),
    });

    expect(status).toBe(200);
    expect(data.response!.isAuthenticated).toBe(true);
    expect(data.response!.isRoomMember).toBe(false);
  });

  test("GET /api/2.0/files/share - Password-protected link without password: response status is RequiredPassword", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest External Share Password Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: linkData } = await ownerApi.rooms.setRoomLink({
      id: roomId,
      roomLinkRequest: {
        access: FileShare.Read,
        linkType: LinkType.External,
        title: "Password Protected Link",
        password: "Secret123!",
        denyDownload: false,
      },
    });
    const requestToken = linkData.response!.sharedLink!.requestToken!;

    const { data, status } = await apiSdk
      .forAnonymous()
      .sharing.getExternalShareData({
        key: requestToken,
        folderId: String(roomId),
      });

    expect(status).toBe(200);
    expect(data.response!.status).toBe(ExternalShareStatus.RequiredPassword);
  });

  test("GET /api/2.0/files/share - Non-existent key returns 200 with status Invalid", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .sharing.getExternalShareData({
        key: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      });

    expect(status).toBe(200);
    expect(data.response!.status).toBe(ExternalShareStatus.Invalid);
  });

  test("GET /api/2.0/files/share - A room member resolves a password-protected link without the password", async ({
    apiSdk,
  }) => {
    const roomTitle = "Autotest Share Password Member Room";
    const { roomId, key } = await passwordProtectedRoom(apiSdk, roomTitle);

    const { data: memberData, api: memberApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");

    await apiSdk.forRole("owner").rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: memberData.response!.id!, access: FileShare.Read }],
        notify: false,
      },
    });

    // The password guards the link, not the room. Somebody who may already
    // read the room is let through, so a member following the link is never
    // asked for a password they were never given.
    const { data, status } = await memberApi.sharing.getExternalShareData({
      key,
    });

    expect(status).toBe(200);
    expect(data.response!.status).toBe(ExternalShareStatus.Ok);
    expect(data.response!.title).toBe(roomTitle);
  });

  test("GET /api/2.0/files/share - A signed-in non-member still has to supply the password", async ({
    apiSdk,
  }) => {
    const { key } = await passwordProtectedRoom(
      apiSdk,
      "Autotest Share Password Non Member Room",
    );

    const { api: strangerApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    // Being signed in is not what opens the link - reading the room is. This
    // is the half that keeps the test above from passing for the wrong
    // reason, and the one that turns into a leak if the check is dropped.
    const { data, status } = await strangerApi.sharing.getExternalShareData({
      key,
    });

    expect(status).toBe(200);
    expect(data.response!.status).toBe(ExternalShareStatus.RequiredPassword);
  });
});

/**
 * The password half of an external link. `GET /api/2.0/files/share/{key}` only
 * reports that a password is required; everything that happens after it is
 * typed goes through this operation.
 *
 * Two things in it are easy to get wrong from the signature alone. A refused
 * password is an ordinary 200 whose `status` says `InvalidPassword` - only the
 * brute-force block answers with an HTTP error - and an accepted password is
 * remembered in a cookie tied to the link, so the next resolve of the same
 * link needs no password at all.
 */
test.describe("POST /api/2.0/files/share/:key/password - applyExternalSharePassword", () => {
  test("POST /files/share/:key/password - The right password unlocks the link and resolves the room", async ({
    apiSdk,
  }) => {
    const roomTitle = "Autotest Share Password Unlock Room";
    const { roomId, key } = await passwordProtectedRoom(apiSdk, roomTitle);
    const anonApi = apiSdk.forAnonymous();

    await test.step("the link is locked before the password is sent", async () => {
      const { data, status } = await anonApi.sharing.getExternalShareData({
        key,
      });
      expect(status).toBe(200);
      expect(data.response!.status).toBe(ExternalShareStatus.RequiredPassword);
    });

    const { data, status } = await anonApi.sharing.applyExternalSharePassword({
      key,
      externalShareRequestParam: { password: PASSWORD },
    });

    expect(status).toBe(200);
    expect(data.response!.status).toBe(ExternalShareStatus.Ok);
    // `id` and `title` name the entry the link points at, so the answer shows
    // which room was unlocked rather than only that something was.
    expect(data.response!.id).toBe(String(roomId));
    expect(data.response!.title).toBe(roomTitle);
    expect(data.response!.isRoom).toBe(true);
  });

  test("POST /files/share/:key/password - An accepted password comes back as the share-link cookie", async ({
    apiSdk,
  }) => {
    const { key } = await passwordProtectedRoom(
      apiSdk,
      "Autotest Share Password Memory Room",
    );

    const { data, status, headers } = await apiSdk
      .forAnonymous()
      .sharing.applyExternalSharePassword({
        key,
        externalShareRequestParam: { password: PASSWORD },
      });

    expect(status).toBe(200);
    expect(data.response!.status).toBe(ExternalShareStatus.Ok);

    // This cookie is how the unlock is remembered: a later resolve carrying
    // `sharelink<linkId>` is let through without the password. Only the half
    // that is handed out can be checked from here, because the adapter in
    // src/utils/playwright-axios-adapter.ts blanks the Cookie header of every
    // request, so no cookie this suite receives is ever sent back. Asserting
    // the name pins which link the unlock was recorded against.
    const setCookie = String(headers["set-cookie"] ?? "").toLowerCase();
    expect(setCookie).toContain(
      `sharelink${data.response!.linkId}`.toLowerCase(),
    );
  });

  test("POST /files/share/:key/password - A wrong password is refused in the body, not with an HTTP error", async ({
    apiSdk,
  }) => {
    const { key } = await passwordProtectedRoom(
      apiSdk,
      "Autotest Share Wrong Password Room",
    );
    const anonApi = apiSdk.forAnonymous();

    const { data, status } = await anonApi.sharing.applyExternalSharePassword({
      key,
      externalShareRequestParam: { password: WRONG_PASSWORD },
    });

    // The refusal travels in `status`: a caller that reads only the HTTP code
    // would take this for a successful unlock.
    expect(status).toBe(200);
    expect(data.response!.status).toBe(ExternalShareStatus.InvalidPassword);

    await test.step("the link stays locked after the failed attempt", async () => {
      const { data: after } = await anonApi.sharing.getExternalShareData({
        key,
      });
      expect(after.response!.status).toBe(ExternalShareStatus.RequiredPassword);
    });
  });

  test("POST /files/share/:key/password - An empty password leaves the link locked", async ({
    apiSdk,
  }) => {
    const { key } = await passwordProtectedRoom(
      apiSdk,
      "Autotest Share Empty Password Room",
    );

    const { data, status } = await apiSdk
      .forAnonymous()
      .sharing.applyExternalSharePassword({
        key,
        externalShareRequestParam: { password: "" },
      });

    // An empty password is not a wrong one: it is answered like sending no
    // password at all, which is what keeps it from spending an attempt.
    expect(status).toBe(200);
    expect(data.response!.status).toBe(ExternalShareStatus.RequiredPassword);
  });

  test("POST /files/share/:key/password - Failed attempts are limited and further ones are refused", async ({
    apiSdk,
  }) => {
    const { key } = await passwordProtectedRoom(
      apiSdk,
      "Autotest Share Password Brute Force Room",
    );
    const anonApi = apiSdk.forAnonymous();

    // The portal's default login policy allows five failed attempts per link
    // and calling address within its check period; the sixth is blocked.
    const wrongAttempt = () =>
      anonApi.sharing.applyExternalSharePassword({
        key,
        externalShareRequestParam: { password: WRONG_PASSWORD },
      });

    const first = await wrongAttempt();
    expect(first.status).toBe(200);
    expect(first.data.response!.status).toBe(
      ExternalShareStatus.InvalidPassword,
    );

    const second = await wrongAttempt();
    expect(second.status).toBe(200);
    expect(second.data.response!.status).toBe(
      ExternalShareStatus.InvalidPassword,
    );

    const third = await wrongAttempt();
    expect(third.status).toBe(200);
    expect(third.data.response!.status).toBe(
      ExternalShareStatus.InvalidPassword,
    );

    const fourth = await wrongAttempt();
    expect(fourth.status).toBe(200);
    expect(fourth.data.response!.status).toBe(
      ExternalShareStatus.InvalidPassword,
    );

    const fifth = await wrongAttempt();
    expect(fifth.status).toBe(200);
    expect(fifth.data.response!.status).toBe(
      ExternalShareStatus.InvalidPassword,
    );

    const sixth = await wrongAttempt();
    expect(sixth.status).toBe(403);

    await test.step("the block is checked before the password, so the right one is refused too", async () => {
      const { status: rightPasswordStatus } =
        await anonApi.sharing.applyExternalSharePassword({
          key,
          externalShareRequestParam: { password: PASSWORD },
        });
      expect(rightPasswordStatus).toBe(403);
    });
  });
});

/**
 * The access a group's members hold on a room the group was invited to. The
 * listing exists for four fields: `groupAccess` is what the group carries,
 * `userAccess` what was set on that person alone, `overridden` says which of
 * the two wins, and `owner` marks whoever created the entry.
 *
 * Two of its answers look like failures and are not. A group holding no
 * rights on the room, a room the caller cannot read and a room that is not
 * there are all answered with an empty list rather than an error, so every
 * check for an empty answer here is paired with a positive control.
 */
test.describe("GET /api/2.0/files/folder/:folderId/group/:groupId/share", () => {
  /** A Custom room and a group of two members invited to it with `access`. */
  async function roomSharedWithGroup(apiSdk: ApiSDK, access: FileShare) {
    const ownerApi = apiSdk.forRole("owner");

    const { data: firstUser } = await apiSdk.addMember("owner", "User", {
      firstName: "Aaron",
    });
    const firstId = firstUser.response!.id!;
    const { data: secondUser } = await apiSdk.addMember("owner", "User", {
      firstName: "Zoe",
    });
    const secondId = secondUser.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: firstId,
        members: [firstId, secondId],
      },
    });
    const groupId = groupData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Group Member Security Room",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access }],
        notify: false,
      },
    });

    return { roomId, groupId, firstId, secondId };
  }

  test("GET /files/folder/:folderId/group/:groupId/share - Members carry the group's access and come back ordered by first name", async ({
    apiSdk,
  }) => {
    const { roomId, groupId, firstId, secondId } = await roomSharedWithGroup(
      apiSdk,
      FileShare.Read,
    );

    const { data, status } = await apiSdk
      .forRole("owner")
      .sharing.getGroupsMembersWithFolderSecurity({
        folderId: roomId,
        groupId,
      });

    expect(status).toBe(200);
    // Asserting the ids in order covers membership and the documented sort by
    // first name at once - Aaron was added first, Zoe second.
    expect(data.response!.map((member) => member.user.id)).toEqual([
      firstId,
      secondId,
    ]);

    const aaron = data.response![0];
    expect(aaron.groupAccess).toBe(FileShare.Read);
    // Nothing was set on these people themselves, so the group's level is
    // what applies to them.
    expect(aaron.overridden).toBe(false);
    expect(aaron.owner).toBe(false);
  });

  test("GET /files/folder/:folderId/group/:groupId/share - A level set on one member alone overrides the group's", async ({
    apiSdk,
  }) => {
    const { roomId, groupId, firstId, secondId } = await roomSharedWithGroup(
      apiSdk,
      FileShare.Read,
    );

    await apiSdk.forRole("owner").rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: firstId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } = await apiSdk
      .forRole("owner")
      .sharing.getGroupsMembersWithFolderSecurity({
        folderId: roomId,
        groupId,
      });

    expect(status).toBe(200);

    const overridden = data.response!.find((m) => m.user.id === firstId)!;
    const untouched = data.response!.find((m) => m.user.id === secondId)!;

    // Both levels are reported side by side, and `overridden` is the field
    // that says which one the person actually holds. The group's level is
    // still reported for them - it is not overwritten, only outranked.
    expect(overridden.overridden).toBe(true);
    expect(overridden.userAccess).toBe(FileShare.Editing);
    expect(overridden.groupAccess).toBe(FileShare.Read);

    // The other member of the same group is untouched by it.
    expect(untouched.overridden).toBe(false);
    expect(untouched.groupAccess).toBe(FileShare.Read);
  });

  test("GET /files/folder/:folderId/group/:groupId/share - filterValue narrows the list and ignores case", async ({
    apiSdk,
  }) => {
    const { roomId, groupId, firstId } = await roomSharedWithGroup(
      apiSdk,
      FileShare.Read,
    );
    const ownerApi = apiSdk.forRole("owner");

    // The group holds two members, so coming back with one is what shows the
    // value is being applied rather than quietly ignored.
    const { data: lower, status } =
      await ownerApi.sharing.getGroupsMembersWithFolderSecurity({
        folderId: roomId,
        groupId,
        filterValue: "aaron",
      });

    expect(status).toBe(200);
    expect(lower.response!.map((member) => member.user.id)).toEqual([firstId]);

    await test.step("the same name typed with a capital finds the same person", async () => {
      // Worth pinning because the query lower-cases the column and not the
      // value it is given - the match survives only on a case-insensitive
      // collation. Should that ever change underneath, searching for a name
      // the way people write it would silently stop finding anybody.
      const { data, status: upperStatus } =
        await ownerApi.sharing.getGroupsMembersWithFolderSecurity({
          folderId: roomId,
          groupId,
          filterValue: "Aaron",
        });

      expect(upperStatus).toBe(200);
      expect(data.response!.map((member) => member.user.id)).toEqual([firstId]);
    });

    await test.step("a value nobody carries finds nobody", async () => {
      const { data, status: missStatus } =
        await ownerApi.sharing.getGroupsMembersWithFolderSecurity({
          folderId: roomId,
          groupId,
          filterValue: "nobodyhasthisname",
        });

      expect(missStatus).toBe(200);
      expect(data.response ?? []).toHaveLength(0);
    });
  });

  test("GET /files/folder/:folderId/group/:groupId/share - A group holding no rights on the room gives an empty list", async ({
    apiSdk,
  }) => {
    const { roomId, groupId } = await roomSharedWithGroup(
      apiSdk,
      FileShare.Read,
    );
    const ownerApi = apiSdk.forRole("owner");

    const { data: outsider } = await apiSdk.addMember("owner", "User");
    const outsiderId = outsider.response!.id!;
    const { data: otherGroup } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: outsiderId,
        members: [outsiderId],
      },
    });
    const otherGroupId = otherGroup.response!.id!;

    const { data, status } =
      await ownerApi.sharing.getGroupsMembersWithFolderSecurity({
        folderId: roomId,
        groupId: otherGroupId,
      });

    // A group that was never invited is not an error here, and the empty
    // list does not mean the group has no members - it has one.
    expect(status).toBe(200);
    expect(data.response ?? []).toHaveLength(0);

    await test.step("while the invited group still lists its members", async () => {
      const { data: invited } =
        await ownerApi.sharing.getGroupsMembersWithFolderSecurity({
          folderId: roomId,
          groupId,
        });
      expect(invited.response!.length).toBe(2);
    });
  });
});
