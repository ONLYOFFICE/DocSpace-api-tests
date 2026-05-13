import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  FileShare,
  EmployeeStatus,
  RoomType,
} from "@onlyoffice/docspace-api-sdk";

test.describe("GET /api/2.0/group/file/{id} - Get groups with file sharing settings", () => {
  test("GET /api/2.0/group/file/{id} - Returns group shared with file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
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

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group).toBeDefined();
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/file/{id} - Returns multiple groups shared with file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: group1Data } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const group1Id = group1Data.response!.id!;

    const { data: group2Data } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const group2Id = group2Data.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [
          { shareTo: group1Id, access: FileShare.Read },
          { shareTo: group2Id, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const sharedIds = data.response
      ?.filter((g) => g.shared === true)
      .map((g) => g.id);
    expect(sharedIds).toContain(group1Id);
    expect(sharedIds).toContain(group2Id);
  });

  test("GET /api/2.0/group/file/{id} - Group is marked shared after sharing with Read access", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
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

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/file/{id} - Group stays shared after changing access from Read to Editing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
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

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/file/{id} - Group without access to file is not marked shared", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: sharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const sharedGroupId = sharedGroupData.response!.id!;

    const { data: unsharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const unsharedGroupId = unsharedGroupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: sharedGroupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const sharedGroup = data.response?.find((g) => g.id === sharedGroupId);
    const unsharedGroup = data.response?.find((g) => g.id === unsharedGroupId);
    expect(sharedGroup?.shared).toBe(true);
    expect(unsharedGroup?.shared).toBeFalsy();
  });

  test("GET /api/2.0/group/file/{id} - No groups are marked shared when file is not shared with any group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const sharedGroups = data.response?.filter((g) => g.shared === true) ?? [];
    expect(sharedGroups).toHaveLength(0);
  });

  test("GET /api/2.0/group/file/{id} - Group stops being shared after sharing is removed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
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

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.None }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBeFalsy();
  });

  test("GET /api/2.0/group/file/{id} - Repeated calls return the same shared group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
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

    const first = await ownerApi.groupSearch.getGroupsWithFilesShared({
      id: fileId,
    });
    const second = await ownerApi.groupSearch.getGroupsWithFilesShared({
      id: fileId,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data.response?.find((g) => g.id === groupId)?.shared).toBe(
      true,
    );
    expect(second.data.response?.find((g) => g.id === groupId)?.shared).toBe(
      true,
    );
  });

  test("GET /api/2.0/group/file/{id} - excludeShared=true excludes already shared groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: sharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const sharedGroupId = sharedGroupData.response!.id!;

    const { data: unsharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const unsharedGroupId = unsharedGroupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: sharedGroupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({
        id: fileId,
        excludeShared: true,
      });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).not.toContain(sharedGroupId);
    expect(ids).toContain(unsharedGroupId);
  });
});

test.describe("GET /api/2.0/group/file/{id} - validation and edge cases", () => {
  test("GET /api/2.0/group/file/{id} - Returns 404 for non-existing file id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithFilesShared({
      id: 999999999,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/file/{id} - Returns 404 for invalid file id format", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithFilesShared({
      id: "not-a-number" as unknown as number,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/file/{id} - Returns 404 for empty file id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithFilesShared({
      id: "" as unknown as number,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/file/{id} - Throws RequiredError for null file id", async ({
    apiSdk,
  }) => {
    await expect(
      apiSdk.forRole("owner").groupSearch.getGroupsWithFilesShared({
        id: null as unknown as number,
      }),
    ).rejects.toThrow(/id/);
  });

  test("GET /api/2.0/group/file/{id} - Throws RequiredError for undefined file id", async ({
    apiSdk,
  }) => {
    await expect(
      apiSdk.forRole("owner").groupSearch.getGroupsWithFilesShared({
        id: undefined as unknown as number,
      }),
    ).rejects.toThrow(/id/);
  });

  test("GET /api/2.0/group/file/{id} - Group with manager is returned with manager info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
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

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.manager?.id).toBe(ownerId);
  });

  test("GET /api/2.0/group/file/{id} - Group with disabled member is still returned as shared", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
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

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [memberId], resendAll: false },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/file/{id} - Group appears only once after repeated sharing updates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
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
    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFilesShared({ id: fileId });

    expect(status).toBe(200);
    const occurrences =
      data.response?.filter((g) => g.id === groupId).length ?? 0;
    expect(occurrences).toBe(1);
  });
});

test.describe("GET /api/2.0/group/folder/{id} - Get groups with folder sharing settings", () => {
  test("GET /api/2.0/group/folder/{id} - Returns group shared with folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group).toBeDefined();
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/folder/{id} - Returns multiple groups shared with folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: group1Data } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const group1Id = group1Data.response!.id!;

    const { data: group2Data } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const group2Id = group2Data.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [
          { shareTo: group1Id, access: FileShare.Read },
          { shareTo: group2Id, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const sharedIds = data.response
      ?.filter((g) => g.shared === true)
      .map((g) => g.id);
    expect(sharedIds).toContain(group1Id);
    expect(sharedIds).toContain(group2Id);
  });

  test("GET /api/2.0/group/folder/{id} - Group stays shared after changing access from Read to Editing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/folder/{id} - Group without access to folder is not marked shared", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: sharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const sharedGroupId = sharedGroupData.response!.id!;

    const { data: unsharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const unsharedGroupId = unsharedGroupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: sharedGroupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const sharedGroup = data.response?.find((g) => g.id === sharedGroupId);
    const unsharedGroup = data.response?.find((g) => g.id === unsharedGroupId);
    expect(sharedGroup?.shared).toBe(true);
    expect(unsharedGroup?.shared).toBeFalsy();
  });

  test("GET /api/2.0/group/folder/{id} - No groups are marked shared when folder is not shared with any group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const sharedGroups = data.response?.filter((g) => g.shared === true) ?? [];
    expect(sharedGroups).toHaveLength(0);
  });

  test("GET /api/2.0/group/folder/{id} - Group stops being shared after sharing is removed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.None }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBeFalsy();
  });

  test("GET /api/2.0/group/folder/{id} - Repeated calls return the same shared group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const first = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });
    const second = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data.response?.find((g) => g.id === groupId)?.shared).toBe(
      true,
    );
    expect(second.data.response?.find((g) => g.id === groupId)?.shared).toBe(
      true,
    );
  });

  test("GET /api/2.0/group/folder/{id} - excludeShared=true excludes already shared groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: sharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const sharedGroupId = sharedGroupData.response!.id!;

    const { data: unsharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const unsharedGroupId = unsharedGroupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: sharedGroupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({
        id: folderId,
        excludeShared: true,
      });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).not.toContain(sharedGroupId);
    expect(ids).toContain(unsharedGroupId);
  });

  test("GET /api/2.0/group/folder/{id} - filterValue returns only matching groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const uniqueToken = apiSdk.faker.generateString(8);
    const matchingName = `match-${uniqueToken}`;
    const nonMatchingName = `other-${apiSdk.faker.generateString(8)}`;

    const { data: matchingGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: matchingName,
        groupManager: ownerId,
      },
    });
    const matchingGroupId = matchingGroupData.response!.id!;

    const { data: nonMatchingGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: nonMatchingName,
        groupManager: ownerId,
      },
    });
    const nonMatchingGroupId = nonMatchingGroupData.response!.id!;

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({
        id: folderId,
        filterValue: uniqueToken,
      });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id) ?? [];
    expect(ids).toContain(matchingGroupId);
    expect(ids).not.toContain(nonMatchingGroupId);
  });

  test("GET /api/2.0/group/folder/{id} - filterValue with no match returns empty list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({
        id: folderId,
        filterValue: `nomatch-${apiSdk.faker.generateString(20)}`,
      });

    expect(status).toBe(200);
    expect(data.response ?? []).toHaveLength(0);
  });

  test("GET /api/2.0/group/folder/{id} - count limits the number of groups returned", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({
        id: folderId,
        count: 1,
      });

    expect(status).toBe(200);
    expect(data.response?.length).toBe(1);
  });

  test("GET /api/2.0/group/folder/{id} - startIndex offsets the result list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const full = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });
    const offset = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
      startIndex: 1,
    });

    expect(full.status).toBe(200);
    expect(offset.status).toBe(200);
    expect(offset.data.response?.length).toBe(
      (full.data.response?.length ?? 0) - 1,
    );
    expect(offset.data.response?.[0]?.id).toBe(full.data.response?.[1]?.id);
  });

  test("GET /api/2.0/group/folder/{id} - count and startIndex work together", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const full = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });
    const page = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
      count: 1,
      startIndex: 1,
    });

    expect(page.status).toBe(200);
    expect(page.data.response?.length).toBe(1);
    expect(page.data.response?.[0]?.id).toBe(full.data.response?.[1]?.id);
  });
});

test.describe("GET /api/2.0/group/folder/{id} - validation and edge cases", () => {
  test("GET /api/2.0/group/folder/{id} - Returns 404 for non-existing folder id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: 999999999,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/folder/{id} - Returns 404 for invalid folder id format", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: "not-a-number" as unknown as number,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/folder/{id} - Returns 404 for empty folder id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: "" as unknown as number,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/folder/{id} - Returns 404 for deleted folder id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    await ownerApi.folders.deleteFolder({
      folderId,
      deleteFolder: { deleteAfter: true, immediately: true },
    });

    await expect(async () => {
      const { status } = await ownerApi.folders.getFolderByFolderId({
        folderId,
      });
      expect(status).not.toBe(200);
    }).toPass({ intervals: [1_000, 2_000, 5_000], timeout: 30_000 });

    const { status } = await ownerApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/folder/{id} - Throws RequiredError for null folder id", async ({
    apiSdk,
  }) => {
    await expect(
      apiSdk.forRole("owner").groupSearch.getGroupsWithFoldersShared({
        id: null as unknown as number,
      }),
    ).rejects.toThrow(/id/);
  });

  test("GET /api/2.0/group/folder/{id} - Throws RequiredError for undefined folder id", async ({
    apiSdk,
  }) => {
    await expect(
      apiSdk.forRole("owner").groupSearch.getGroupsWithFoldersShared({
        id: undefined as unknown as number,
      }),
    ).rejects.toThrow(/id/);
  });

  test("GET /api/2.0/group/folder/{id} - Group with manager is returned with manager info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.manager?.id).toBe(ownerId);
  });

  test("GET /api/2.0/group/folder/{id} - Group with disabled member is still returned as shared", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [memberId], resendAll: false },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/folder/{id} - Group appears only once after repeated sharing updates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });
    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const occurrences =
      data.response?.filter((g) => g.id === groupId).length ?? 0;
    expect(occurrences).toBe(1);
  });

  test("GET /api/2.0/group/folder/{id} - Response items contain expected group fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolder: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFolderSecurityInfo({
      folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.id).toBe(groupId);
    expect(group?.name).toBe(groupName);
    expect(group?.category).toBeDefined();
  });
});

test.describe("GET /api/2.0/group/room/{id} - Get groups with room sharing settings", () => {
  test("GET /api/2.0/group/room/{id} - Returns group shared with room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group).toBeDefined();
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/room/{id} - Returns multiple groups shared with room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: group1Data } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const group1Id = group1Data.response!.id!;

    const { data: group2Data } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const group2Id = group2Data.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: group1Id, access: FileShare.Read },
          { id: group2Id, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const sharedIds = data.response
      ?.filter((g) => g.shared === true)
      .map((g) => g.id);
    expect(sharedIds).toContain(group1Id);
    expect(sharedIds).toContain(group2Id);
  });

  test("GET /api/2.0/group/room/{id} - Group is marked shared after sharing with Read access", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/room/{id} - Group stays shared after changing access from Read to Editing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/room/{id} - Group without access to room is not marked shared", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: sharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const sharedGroupId = sharedGroupData.response!.id!;

    const { data: unsharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const unsharedGroupId = unsharedGroupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: sharedGroupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const sharedGroup = data.response?.find((g) => g.id === sharedGroupId);
    const unsharedGroup = data.response?.find((g) => g.id === unsharedGroupId);
    expect(sharedGroup?.shared).toBe(true);
    expect(unsharedGroup?.shared).toBeFalsy();
  });

  test("GET /api/2.0/group/room/{id} - No groups are marked shared when room is not shared with any group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const sharedGroups = data.response?.filter((g) => g.shared === true) ?? [];
    expect(sharedGroups).toHaveLength(0);
  });

  test("GET /api/2.0/group/room/{id} - Group stops being shared after sharing is removed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.None }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBeFalsy();
  });

  test("GET /api/2.0/group/room/{id} - Repeated calls return the same shared group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const first = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });
    const second = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.data.response?.find((g) => g.id === groupId)?.shared).toBe(
      true,
    );
    expect(second.data.response?.find((g) => g.id === groupId)?.shared).toBe(
      true,
    );
  });

  test("GET /api/2.0/group/room/{id} - excludeShared=true excludes already shared groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: sharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const sharedGroupId = sharedGroupData.response!.id!;

    const { data: unsharedGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const unsharedGroupId = unsharedGroupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: sharedGroupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({
        id: roomId,
        excludeShared: true,
      });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).not.toContain(sharedGroupId);
    expect(ids).toContain(unsharedGroupId);
  });

  test("GET /api/2.0/group/room/{id} - excludeShared=false returns already shared groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({
        id: roomId,
        excludeShared: false,
      });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).toContain(groupId);
  });

  test("GET /api/2.0/group/room/{id} - filterValue returns only matching groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const uniqueToken = apiSdk.faker.generateString(8);
    const matchingName = `match-${uniqueToken}`;
    const nonMatchingName = `other-${apiSdk.faker.generateString(8)}`;

    const { data: matchingGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: matchingName,
        groupManager: ownerId,
      },
    });
    const matchingGroupId = matchingGroupData.response!.id!;

    const { data: nonMatchingGroupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: nonMatchingName,
        groupManager: ownerId,
      },
    });
    const nonMatchingGroupId = nonMatchingGroupData.response!.id!;

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({
        id: roomId,
        filterValue: uniqueToken,
      });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id) ?? [];
    expect(ids).toContain(matchingGroupId);
    expect(ids).not.toContain(nonMatchingGroupId);
  });

  test("GET /api/2.0/group/room/{id} - filterValue with no match returns empty list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({
        id: roomId,
        filterValue: `nomatch-${apiSdk.faker.generateString(20)}`,
      });

    expect(status).toBe(200);
    expect(data.response ?? []).toHaveLength(0);
  });

  test("GET /api/2.0/group/room/{id} - Empty filterValue behaves like no filter", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    for (let i = 0; i < 2; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const noFilter = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });
    const emptyFilter = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
      filterValue: "",
    });

    expect(noFilter.status).toBe(200);
    expect(emptyFilter.status).toBe(200);
    expect(emptyFilter.data.response?.length).toBe(
      noFilter.data.response?.length,
    );
  });

  test("GET /api/2.0/group/room/{id} - filterValue with special characters does not error", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { status } = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
      filterValue: "test %_$ #@!",
    });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/group/room/{id} - count limits the number of groups returned", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({
        id: roomId,
        count: 1,
      });

    expect(status).toBe(200);
    expect(data.response?.length).toBe(1);
  });

  test("GET /api/2.0/group/room/{id} - startIndex offsets the result list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const full = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });
    const offset = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
      startIndex: 1,
    });

    expect(full.status).toBe(200);
    expect(offset.status).toBe(200);
    expect(offset.data.response?.length).toBe(
      (full.data.response?.length ?? 0) - 1,
    );
    expect(offset.data.response?.[0]?.id).toBe(full.data.response?.[1]?.id);
  });

  test("GET /api/2.0/group/room/{id} - count and startIndex work together", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const full = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });
    const page = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
      count: 1,
      startIndex: 1,
    });

    expect(page.status).toBe(200);
    expect(page.data.response?.length).toBe(1);
    expect(page.data.response?.[0]?.id).toBe(full.data.response?.[1]?.id);
  });
});

test.describe("GET /api/2.0/group/room/{id} - validation and edge cases", () => {
  test("GET /api/2.0/group/room/{id} - Returns 404 for non-existing room id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: 999999999,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/room/{id} - Returns 404 for negative room id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: -1,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/room/{id} - Returns 404 for invalid room id format", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: "not-a-number" as unknown as number,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/room/{id} - Returns 404 for empty room id", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupSearch.getGroupsWithRoomsShared({
      id: "" as unknown as number,
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/room/{id} - Throws RequiredError for null room id", async ({
    apiSdk,
  }) => {
    await expect(
      apiSdk.forRole("owner").groupSearch.getGroupsWithRoomsShared({
        id: null as unknown as number,
      }),
    ).rejects.toThrow(/id/);
  });

  test("GET /api/2.0/group/room/{id} - Throws RequiredError for undefined room id", async ({
    apiSdk,
  }) => {
    await expect(
      apiSdk.forRole("owner").groupSearch.getGroupsWithRoomsShared({
        id: undefined as unknown as number,
      }),
    ).rejects.toThrow(/id/);
  });

  test("GET /api/2.0/group/room/{id} - Group with manager is returned with manager info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.manager?.id).toBe(ownerId);
  });

  test("GET /api/2.0/group/room/{id} - Group with disabled member is still returned as shared", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [memberId], resendAll: false },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/room/{id} - Group appears only once after repeated sharing updates", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const occurrences =
      data.response?.filter((g) => g.id === groupId).length ?? 0;
    expect(occurrences).toBe(1);
  });

  test("GET /api/2.0/group/room/{id} - Response items contain expected group fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await ownerApi.groupSearch.getGroupsWithRoomsShared({ id: roomId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.id).toBe(groupId);
    expect(group?.name).toBe(groupName);
    expect(group?.category).toBeDefined();
  });
});
