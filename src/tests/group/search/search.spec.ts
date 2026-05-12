import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

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
