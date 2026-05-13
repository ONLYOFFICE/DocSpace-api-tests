import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /api/2.0/group/file/{id} - Permissions", () => {
  test("GET /api/2.0/group/file/{id} - DocSpaceAdmin cannot get groups shared with owner's file", async ({
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

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.groupSearch.getGroupsWithFilesShared({
      id: fileId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/file/{id} - File owner (User) gets groups shared with own file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = groupData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: myDocsData } = await userApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await userApi.files.createFile({
      folderId: myDocsFolderId,
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    await userApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.groupSearch.getGroupsWithFilesShared(
      { id: fileId },
    );

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/file/{id} - User without access to file cannot get groups info", async ({
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

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupSearch.getGroupsWithFilesShared({
      id: fileId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/file/{id} - Guest without access to file cannot get groups info", async ({
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

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupSearch.getGroupsWithFilesShared({
      id: fileId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/file/{id} - Unauthenticated request is rejected with 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.groupSearch.getGroupsWithFilesShared({
      id: fileId,
    });

    expect(status).toBe(401);
  });
});
