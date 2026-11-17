import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, RoomType } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /api/2.0/group/file/{id} - Permissions", () => {
  test("GET /api/2.0/group/file/{id} - DocSpaceAdmin cannot get groups shared with owner's file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: apiSdk.faker.generateString(15) },
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
      id: fileId,
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

  // A RoomAdmin, not a plain User, although either may own the entry. This test
  // was written in May with a User and was right then; server commit f2cfa7336
  // (2026-10-16, "offer only the Everyone group to those who cannot read
  // groups") narrowed this endpoint on purpose, and since then a user or a
  // guest is offered nothing but Everyone here - see
  // `FileSharing.CanPickAnyGroupAsync`.
  //
  // The entry's access list was deliberately left alone by that commit, so a
  // User does still see the group through `GET /files/file/{id}/share`; it is
  // only this picker that stops naming it. Both sides are covered below.
  test("GET /api/2.0/group/file/{id} - File owner (RoomAdmin) gets groups shared with own file", async ({
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
      "RoomAdmin",
    );

    const { data: myDocsData } = await userApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: fileData } = await userApi.files.createFile({
      folderId: myDocsFolderId,
      createFileRequest: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    await userApi.sharing.setFileSecurityInfo({
      id: fileId,
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

  test("GET /api/2.0/group/file/{id} - A User owning the file is offered only the system group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: groupData, status: groupStatus } =
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    expect(groupStatus).toBe(200);
    const groupId = groupData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data: myDocsData } = await userApi.folders.getMyFolder();
    const { data: fileData } = await userApi.files.createFile({
      folderId: myDocsData.response!.current!.id!,
      createFileRequest: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    // The share itself goes through: a User may share with a group whose id it
    // was given, it just may not be shown the portal's groups. Asserted so the
    // absence below cannot be read as a share that never happened - which is
    // what made the sibling test above look like a product failure.
    const { data: shared, status: shareStatus } =
      await userApi.sharing.setFileSecurityInfo({
        id: fileId,
        securityInfoSimpleRequestDto: {
          share: [{ shareTo: groupId, access: FileShare.Read }],
          notify: false,
        },
      });
    expect(shareStatus).toBe(200);
    expect(
      shared.response?.map((record) => record.sharedTo?.id),
      "the group never reached the file's access list",
    ).toContain(groupId);

    const { data, status } = await userApi.groupSearch.getGroupsWithFilesShared(
      { id: fileId },
    );
    expect(status).toBe(200);

    // Everyone and nothing else: by `FileSharing.CanPickAnyGroupAsync` a user
    // or a guest is never offered another group, their own file included. The
    // system group is asserted present as well, so an answer that came back
    // empty for some other reason cannot pass for the rule holding.
    expect(data.response).toHaveLength(1);
    expect(data.response![0].isSystem).toBe(true);
    expect(data.response!.map((g) => g.id)).not.toContain(groupId);
  });

  test("GET /api/2.0/group/file/{id} - User without access to file cannot get groups info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileRequest: { title: apiSdk.faker.generateString(15) },
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
      id: fileId,
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
      createFileRequest: { title: apiSdk.faker.generateString(15) },
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
      id: fileId,
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
      createFileRequest: { title: apiSdk.faker.generateString(15) },
    });
    const fileId = fileData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.groupSearch.getGroupsWithFilesShared({
      id: fileId,
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/group/folder/{id} - Permissions", () => {
  test("GET /api/2.0/group/folder/{id} - DocSpaceAdmin cannot get groups shared with owner's folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolderRequest: { title: apiSdk.faker.generateString(15) },
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
      id: folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });

    expect(status).toBe(403);
  });

  // A RoomAdmin, not a plain User, although either may own the entry. This test
  // was written in May with a User and was right then; server commit f2cfa7336
  // (2026-10-16, "offer only the Everyone group to those who cannot read
  // groups") narrowed this endpoint on purpose, and since then a user or a
  // guest is offered nothing but Everyone here - see
  // `FileSharing.CanPickAnyGroupAsync`.
  //
  // The entry's access list was deliberately left alone by that commit, so a
  // User does still see the group through `GET /files/file/{id}/share`; it is
  // only this picker that stops naming it. Both sides are covered below.
  test("GET /api/2.0/group/folder/{id} - Folder owner (RoomAdmin) gets groups shared with own folder", async ({
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
      "RoomAdmin",
    );

    const { data: myDocsData } = await userApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await userApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolderRequest: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    await userApi.sharing.setFolderSecurityInfo({
      id: folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await userApi.groupSearch.getGroupsWithFoldersShared({ id: folderId });

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/folder/{id} - User without access to folder cannot get groups info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolderRequest: { title: apiSdk.faker.generateString(15) },
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
      id: folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/folder/{id} - Guest without access to folder cannot get groups info", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolderRequest: { title: apiSdk.faker.generateString(15) },
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
      id: folderId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/folder/{id} - Unauthenticated request is rejected with 401", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: myDocsData } = await ownerApi.folders.getMyFolder();
    const myDocsFolderId = myDocsData.response!.current!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: myDocsFolderId,
      createFolderRequest: { title: apiSdk.faker.generateString(15) },
    });
    const folderId = folderData.response!.id!;

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.groupSearch.getGroupsWithFoldersShared({
      id: folderId,
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/group/room/{id} - Permissions", () => {
  test("GET /api/2.0/group/room/{id} - DocSpaceAdmin cannot get groups shared with owner's room", async ({
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

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/room/{id} - Room owner (RoomAdmin) gets groups shared with own room", async ({
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
      "RoomAdmin",
    );

    const { data: roomData } = await userApi.rooms.createRoom({
      createRoomRequestDto: {
        title: apiSdk.faker.generateString(15),
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await userApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } = await userApi.groupSearch.getGroupsWithRoomsShared(
      { id: roomId },
    );

    expect(status).toBe(200);
    const group = data.response?.find((g) => g.id === groupId);
    expect(group?.shared).toBe(true);
  });

  test("GET /api/2.0/group/room/{id} - User without access to room cannot get groups info", async ({
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

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/room/{id} - Guest without access to room cannot get groups info", async ({
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

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/room/{id} - User invited to room as Read cannot get groups info", async ({
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

    const { api: userApi, data: invitedUser } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: invitedUser.response!.id!, access: FileShare.Read },
        ],
        notify: false,
      },
    });

    const { status } = await userApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/room/{id} - Unauthenticated request is rejected with 401", async ({
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

    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.groupSearch.getGroupsWithRoomsShared({
      id: roomId,
    });

    expect(status).toBe(401);
  });
});
