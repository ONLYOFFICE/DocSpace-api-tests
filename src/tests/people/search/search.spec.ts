import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import {
  RoomType,
  FileShare,
  EmployeeStatus,
} from "@onlyoffice/docspace-api-sdk";

test.describe("GET /accounts/file/:id/search - Search accounts for file sharing", () => {
  test("GET /accounts/file/:id/search - Owner searches accounts by name for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;
    const userName = memberData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search File Shared",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Search File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data } =
      await ownerApi.peopleSearch.getAccountsEntriesWithFilesShared({
        id: fileId,
        filterValue: userName,
      });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /accounts/file/:id/search - DocSpace admin searches accounts for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: adminMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminMemberId = adminMemberData.response!.id!;
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: adminMemberId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Search File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data } =
      await adminApi.peopleSearch.getAccountsEntriesWithFilesShared({
        id: fileId,
        filterValue: userName,
      });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /accounts/file/:id/search - Room admin searches accounts for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Search File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data } =
      await roomAdminApi.peopleSearch.getAccountsEntriesWithFilesShared({
        id: fileId,
        filterValue: userName,
      });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });
});

test.describe("GET /people/file/:id - Search users for file sharing", () => {
  test("GET /people/file/:id - Owner searches users for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;
    const userName = memberData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users File Owner",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Users File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data } = await ownerApi.peopleSearch.getUsersWithFilesShared({
      id: fileId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/file/:id/filter - DocSpace admin searches users for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users File Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Users File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data } = await adminApi.peopleSearch.getUsersWithFilesShared({
      id: fileId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/file/:id/filter - Room admin searches users for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users File RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Users File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data } = await roomAdminApi.peopleSearch.getUsersWithFilesShared({
      id: fileId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/file/:id - User searches users for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: searchableMemberData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const userId = searchableMemberData.response!.id!;
    const userName = searchableMemberData.response!.displayName!;

    const { data: userMemberData, userData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;
    const userApi = await apiSdk.authenticateMember(userData, "User");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users File User",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: userMemberId, access: FileShare.Editing },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data: fileData } = await ownerApi.files.createFile({
      folderId: roomId,
      createFileJsonElement: {
        title: "Autotest Users File",
      },
    });
    const fileId = fileData.response!.id!;

    const { data } = await userApi.peopleSearch.getUsersWithFilesShared({
      id: fileId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });
});

test.describe("GET /accounts/folder/:id/search - Search accounts for folder sharing", () => {
  test("GET /accounts/folder/:id/search - Owner searches accounts by name for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;
    const userName = memberData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search Folder Shared",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: {
        title: "Autotest Search Folder",
      },
    });
    const folderId = folderData.response!.id!;

    await expect(async () => {
      const { data } =
        await ownerApi.peopleSearch.getAccountsEntriesWithFoldersShared({
          id: folderId,
          filterValue: userName,
        });
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);
      expect((data.response as any[])[0].id).toBe(userId);
      expect((data.response as any[])[0].displayName).toBe(userName);
    }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
  });

  test("GET /accounts/folder/:id/search - DocSpace admin searches accounts for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: adminMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminMemberId = adminMemberData.response!.id!;
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search Folder Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: adminMemberId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: {
        title: "Autotest Search Folder",
      },
    });
    const folderId = folderData.response!.id!;

    const { data } =
      await adminApi.peopleSearch.getAccountsEntriesWithFoldersShared({
        id: folderId,
        filterValue: userName,
      });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /accounts/folder/:id/search - Room admin searches accounts for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search Folder RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: {
        title: "Autotest Search Folder",
      },
    });
    const folderId = folderData.response!.id!;

    const { data } =
      await roomAdminApi.peopleSearch.getAccountsEntriesWithFoldersShared({
        id: folderId,
        filterValue: userName,
      });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });
});

test.describe("GET /people/folder/:id - Search users for folder sharing", () => {
  test("GET /people/folder/:id - Owner searches users for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;
    const userName = memberData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users Folder Owner",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: {
        title: "Autotest Users Folder",
      },
    });
    const folderId = folderData.response!.id!;

    const { data } = await ownerApi.peopleSearch.getUsersWithFoldersShared({
      id: folderId,
      filterValue: userName,
    });

    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/folder/:id - DocSpace admin searches users for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users Folder Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: {
        title: "Autotest Users Folder",
      },
    });
    const folderId = folderData.response!.id!;

    const { data } = await adminApi.peopleSearch.getUsersWithFoldersShared({
      id: folderId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/folder/:id - Room admin searches users for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users Folder RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: {
        title: "Autotest Users Folder",
      },
    });
    const folderId = folderData.response!.id!;

    const { data } = await roomAdminApi.peopleSearch.getUsersWithFoldersShared({
      id: folderId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/folder/:id - User searches users for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: searchableMemberData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const userId = searchableMemberData.response!.id!;
    const userName = searchableMemberData.response!.displayName!;

    const { data: userMemberData, userData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;
    const userApi = await apiSdk.authenticateMember(userData, "User");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users Folder User",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: userMemberId, access: FileShare.Editing },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data: folderData } = await ownerApi.folders.createFolder({
      folderId: roomId,
      createFolder: {
        title: "Autotest Users Folder",
      },
    });
    const folderId = folderData.response!.id!;

    const { data } = await userApi.peopleSearch.getUsersWithFoldersShared({
      id: folderId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });
});

test.describe("GET /accounts/room/:id/search - Search accounts for room sharing", () => {
  test("GET /accounts/room/:id/search - Owner searches accounts by name for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;
    const userName = memberData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search Room Shared",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data } =
      await ownerApi.peopleSearch.getAccountsEntriesWithRoomsShared({
        id: roomId,
        filterValue: userName,
      });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /accounts/room/:id/search - DocSpace admin searches accounts for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: adminMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminMemberId = adminMemberData.response!.id!;
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search Room Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: adminMemberId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data } =
      await adminApi.peopleSearch.getAccountsEntriesWithRoomsShared({
        id: roomId,
        filterValue: userName,
      });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /accounts/room/:id/search - Room admin searches accounts for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Search Room RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data } =
      await roomAdminApi.peopleSearch.getAccountsEntriesWithRoomsShared({
        id: roomId,
        filterValue: userName,
      });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });
});

test.describe("GET /people/room/:id - Search users for room sharing", () => {
  test("GET /people/room/:id - Owner searches users for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const userId = memberData.response!.id!;
    const userName = memberData.response!.displayName!;

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users Room Owner",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data } = await ownerApi.peopleSearch.getUsersWithRoomShared({
      id: roomId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/room/:id - DocSpace admin searches users for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users Room Admin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [{ id: userId, access: FileShare.Editing }],
        notify: false,
      },
    });

    const { data } = await adminApi.peopleSearch.getUsersWithRoomShared({
      id: roomId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/room/:id - Room admin searches users for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users Room RoomAdmin",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: roomAdminId, access: FileShare.RoomManager },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data } = await roomAdminApi.peopleSearch.getUsersWithRoomShared({
      id: roomId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });

  test("GET /people/room/:id - User searches users for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: searchableMemberData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const userId = searchableMemberData.response!.id!;
    const userName = searchableMemberData.response!.displayName!;

    const { data: userMemberData, userData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;
    const userApi = await apiSdk.authenticateMember(userData, "User");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      createRoomRequestDto: {
        title: "Autotest Users Room User",
        roomType: RoomType.CustomRoom,
      },
    });
    const roomId = roomData.response!.id!;

    await ownerApi.rooms.setRoomSecurity({
      id: roomId,
      roomInvitationRequest: {
        invitations: [
          { id: userMemberId, access: FileShare.Editing },
          { id: userId, access: FileShare.Editing },
        ],
        notify: false,
      },
    });

    const { data } = await userApi.peopleSearch.getUsersWithRoomShared({
      id: roomId,
      filterValue: userName,
    });
    expect(data.statusCode).toBe(200);
    expect(data.count).toBe(1);
    expect((data.response as any[])[0].id).toBe(userId);
    expect((data.response as any[])[0].displayName).toBe(userName);
  });
});

test.describe("GET /accounts/search - Search accounts", () => {
  test("GET /accounts/search - Owner searches accounts by email and name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminEmail = adminData.response!.email!;
    const adminName = adminData.response!.displayName!;

    const { data: roomAdminMemberData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminMemberData.response!.email!;
    const roomAdminName = roomAdminMemberData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;
    const userName = userData.response!.displayName!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestEmail = guestData.response!.email!;
    const guestName = guestData.response!.displayName!;

    await test.step("Owner searches DocSpaceAdmin by email", async () => {
      const { data } = await ownerApi.peopleSearch.getSearch({
        query: adminEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === adminEmail),
      ).toBe(true);
    });

    await test.step("Owner searches DocSpaceAdmin by name", async () => {
      const { data } = await ownerApi.peopleSearch.getSearch({
        query: adminName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === adminName),
      ).toBe(true);
    });

    await test.step("Owner searches RoomAdmin by email", async () => {
      const { data } = await ownerApi.peopleSearch.getSearch({
        query: roomAdminEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === roomAdminEmail),
      ).toBe(true);
    });

    await test.step("Owner searches RoomAdmin by name", async () => {
      const { data } = await ownerApi.peopleSearch.getSearch({
        query: roomAdminName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.displayName === roomAdminName,
        ),
      ).toBe(true);
    });

    await test.step("Owner searches User by email", async () => {
      const { data } = await ownerApi.peopleSearch.getSearch({
        query: userEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === userEmail),
      ).toBe(true);
    });

    await test.step("Owner searches User by name", async () => {
      const { data } = await ownerApi.peopleSearch.getSearch({
        query: userName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === userName),
      ).toBe(true);
    });

    await test.step("Owner searches Guest by email", async () => {
      const { data } = await ownerApi.peopleSearch.getSearch({
        query: guestEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === guestEmail),
      ).toBe(true);
    });

    await test.step("Owner searches Guest by name", async () => {
      const { data } = await ownerApi.peopleSearch.getSearch({
        query: guestName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === guestName),
      ).toBe(true);
    });
  });

  test("GET /accounts/search - DocSpace admin searches accounts by email and name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;
    const ownerName = ownerData.response!.displayName!;

    const { data: roomAdminMemberData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminMemberData.response!.email!;
    const roomAdminName = roomAdminMemberData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;
    const userName = userData.response!.displayName!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestEmail = guestData.response!.email!;
    const guestName = guestData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    await test.step("DocSpace admin searches Owner by email", async () => {
      const { data } = await adminApi.peopleSearch.getSearch({
        query: ownerEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === ownerEmail),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches Owner by name", async () => {
      const { data } = await adminApi.peopleSearch.getSearch({
        query: ownerName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === ownerName),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches RoomAdmin by email", async () => {
      const { data } = await adminApi.peopleSearch.getSearch({
        query: roomAdminEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === roomAdminEmail),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches RoomAdmin by name", async () => {
      const { data } = await adminApi.peopleSearch.getSearch({
        query: roomAdminName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.displayName === roomAdminName,
        ),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches User by email", async () => {
      const { data } = await adminApi.peopleSearch.getSearch({
        query: userEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === userEmail),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches User by name", async () => {
      const { data } = await adminApi.peopleSearch.getSearch({
        query: userName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === userName),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches Guest by email", async () => {
      const { data } = await adminApi.peopleSearch.getSearch({
        query: guestEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === guestEmail),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches Guest by name", async () => {
      const { data } = await adminApi.peopleSearch.getSearch({
        query: guestName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === guestName),
      ).toBe(true);
    });
  });
});

test.describe("GET /people/search - Search users by query", () => {
  test("GET /people/search - Owner searches users by email and name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminEmail = adminData.response!.email!;
    const adminName = adminData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminData.response!.email!;
    const roomAdminName = roomAdminData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;
    const userName = userData.response!.displayName!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestEmail = guestData.response!.email!;
    const guestName = guestData.response!.displayName!;

    await test.step("Owner searches DocSpaceAdmin by email", async () => {
      const { data } = await ownerApi.peopleSearch.searchUsersByQuery({
        query: adminEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === adminEmail),
      ).toBe(true);
    });

    await test.step("Owner searches DocSpaceAdmin by name", async () => {
      const { data } = await ownerApi.peopleSearch.searchUsersByQuery({
        query: adminName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === adminName),
      ).toBe(true);
    });

    await test.step("Owner searches RoomAdmin by email", async () => {
      const { data } = await ownerApi.peopleSearch.searchUsersByQuery({
        query: roomAdminEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === roomAdminEmail),
      ).toBe(true);
    });

    await test.step("Owner searches RoomAdmin by name", async () => {
      const { data } = await ownerApi.peopleSearch.searchUsersByQuery({
        query: roomAdminName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.displayName === roomAdminName,
        ),
      ).toBe(true);
    });

    await test.step("Owner searches User by email", async () => {
      const { data } = await ownerApi.peopleSearch.searchUsersByQuery({
        query: userEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === userEmail),
      ).toBe(true);
    });

    await test.step("Owner searches User by name", async () => {
      const { data } = await ownerApi.peopleSearch.searchUsersByQuery({
        query: userName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === userName),
      ).toBe(true);
    });

    await test.step("Owner searches Guest by email", async () => {
      const { data } = await ownerApi.peopleSearch.searchUsersByQuery({
        query: guestEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === guestEmail),
      ).toBe(true);
    });

    await test.step("Owner searches Guest by name", async () => {
      const { data } = await ownerApi.peopleSearch.searchUsersByQuery({
        query: guestName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === guestName),
      ).toBe(true);
    });
  });

  test("GET /people/search - DocSpace admin searches users by email and name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;
    const ownerName = ownerData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminData.response!.email!;
    const roomAdminName = roomAdminData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;
    const userName = userData.response!.displayName!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestEmail = guestData.response!.email!;
    const guestName = guestData.response!.displayName!;

    await test.step("DocSpace admin searches Owner by email", async () => {
      const { data } = await adminApi.peopleSearch.searchUsersByQuery({
        query: ownerEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === ownerEmail),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches Owner by name", async () => {
      const { data } = await adminApi.peopleSearch.searchUsersByQuery({
        query: ownerName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === ownerName),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches RoomAdmin by email", async () => {
      const { data } = await adminApi.peopleSearch.searchUsersByQuery({
        query: roomAdminEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === roomAdminEmail),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches RoomAdmin by name", async () => {
      const { data } = await adminApi.peopleSearch.searchUsersByQuery({
        query: roomAdminName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.displayName === roomAdminName,
        ),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches User by email", async () => {
      const { data } = await adminApi.peopleSearch.searchUsersByQuery({
        query: userEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === userEmail),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches User by name", async () => {
      const { data } = await adminApi.peopleSearch.searchUsersByQuery({
        query: userName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === userName),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches Guest by email", async () => {
      const { data } = await adminApi.peopleSearch.searchUsersByQuery({
        query: guestEmail,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.email === guestEmail),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches Guest by name", async () => {
      const { data } = await adminApi.peopleSearch.searchUsersByQuery({
        query: guestName,
      });
      expect(data.statusCode).toBe(200);
      expect(
        (data.response as any[]).some((u: any) => u.displayName === guestName),
      ).toBe(true);
    });
  });
});

test.describe("GET /people/status/:status/search - Search users by status", () => {
  test("GET /people/status/:status/search - Owner searches active and disabled users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    const { data: activeData, status: activeStatus } =
      await ownerApi.peopleSearch.searchUsersByStatus({
        status: EmployeeStatus.Active,
        query: userEmail,
      });
    expect(activeStatus).toBe(200);
    expect(
      (activeData.response as any[]).some(
        (u: any) => u.id === userId && u.email === userEmail,
      ),
    ).toBe(true);

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [userId],
      },
    });

    const { data: terminatedData, status: terminatedStatus } =
      await ownerApi.peopleSearch.searchUsersByStatus({
        status: EmployeeStatus.Terminated,
        query: userEmail,
      });
    expect(terminatedStatus).toBe(200);
    expect(
      (terminatedData.response as any[]).some(
        (u: any) => u.id === userId && u.email === userEmail,
      ),
    ).toBe(true);
  });

  test("GET /people/status/:status/search - DocSpace admin searches active and disabled users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: activeData, status: activeStatus } =
      await adminApi.peopleSearch.searchUsersByStatus({
        status: EmployeeStatus.Active,
        query: userEmail,
      });
    expect(activeStatus).toBe(200);
    expect(
      (activeData.response as any[]).some(
        (u: any) => u.id === userId && u.email === userEmail,
      ),
    ).toBe(true);

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [userId],
      },
    });

    const { data: terminatedData, status: terminatedStatus } =
      await adminApi.peopleSearch.searchUsersByStatus({
        status: EmployeeStatus.Terminated,
        query: userEmail,
      });
    expect(terminatedStatus).toBe(200);
    expect(
      (terminatedData.response as any[]).some(
        (u: any) => u.id === userId && u.email === userEmail,
      ),
    ).toBe(true);
  });
});

test.describe("GET /people/simple/filter - Simple filter accounts", () => {
  test("GET /people/simple/filter - Owner searches accounts", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;
    const adminName = adminData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminName = roomAdminData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: guestData, status: guestStatus } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    expect(guestStatus).toBe(200);
    const guestId = guestData.response!.id!;
    const guestName = guestData.response!.displayName!;

    await test.step("Owner searches DocSpaceAdmin", async () => {
      const { data, status } = await ownerApi.peopleSearch.getSimpleByFilter({
        filterValue: adminName,
      });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === adminId && u.displayName === adminName,
        ),
      ).toBe(true);
    });

    await test.step("Owner searches RoomAdmin", async () => {
      const { data, status } = await ownerApi.peopleSearch.getSimpleByFilter({
        filterValue: roomAdminName,
      });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === roomAdminId && u.displayName === roomAdminName,
        ),
      ).toBe(true);
    });

    await test.step("Owner searches User", async () => {
      const { data, status } = await ownerApi.peopleSearch.getSimpleByFilter({
        filterValue: userName,
      });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === userId && u.displayName === userName,
        ),
      ).toBe(true);
    });

    await test.step("Owner searches Guest", async () => {
      const { data, status } = await ownerApi.peopleSearch.getSimpleByFilter({
        filterValue: guestName,
      });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === guestId && u.displayName === guestName,
        ),
      ).toBe(true);
    });
  });

  test("GET /people/simple/filter - DocSpace admin searches accounts", async ({
    apiSdk,
  }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const ownerName = ownerData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminName = roomAdminData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: guestData, status: guestStatus } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    expect(guestStatus).toBe(200);
    const guestId = guestData.response!.id!;
    const guestName = guestData.response!.displayName!;

    await test.step("DocSpace admin searches Owner", async () => {
      const { data, status } = await adminApi.peopleSearch.getSimpleByFilter({
        filterValue: ownerName,
      });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === ownerId && u.displayName === ownerName,
        ),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches RoomAdmin", async () => {
      const { data, status } = await adminApi.peopleSearch.getSimpleByFilter({
        filterValue: roomAdminName,
      });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === roomAdminId && u.displayName === roomAdminName,
        ),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches User", async () => {
      const { data, status } = await adminApi.peopleSearch.getSimpleByFilter({
        filterValue: userName,
      });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === userId && u.displayName === userName,
        ),
      ).toBe(true);
    });

    await test.step("DocSpace admin searches Guest", async () => {
      const { data, status } = await adminApi.peopleSearch.getSimpleByFilter({
        filterValue: guestName,
      });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === guestId && u.displayName === guestName,
        ),
      ).toBe(true);
    });
  });

  test("GET /people/simple/filter - Room admin searches accounts", async ({
    apiSdk,
  }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const ownerName = ownerData.response!.displayName!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;
    const adminName = adminData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    await test.step("Room admin searches Owner", async () => {
      const { data, status } =
        await roomAdminApi.peopleSearch.getSimpleByFilter({
          filterValue: ownerName,
        });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === ownerId && u.displayName === ownerName,
        ),
      ).toBe(true);
    });

    await test.step("Room admin searches DocSpaceAdmin", async () => {
      const { data, status } =
        await roomAdminApi.peopleSearch.getSimpleByFilter({
          filterValue: adminName,
        });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === adminId && u.displayName === adminName,
        ),
      ).toBe(true);
    });

    await test.step("Room admin searches User", async () => {
      const { data, status } =
        await roomAdminApi.peopleSearch.getSimpleByFilter({
          filterValue: userName,
        });
      expect(status).toBe(200);
      expect(
        (data.response as any[]).some(
          (u: any) => u.id === userId && u.displayName === userName,
        ),
      ).toBe(true);
    });
  });
});

test.describe("GET /people/filter - Extended filter accounts", () => {
  test("GET /people/filter - Owner searches accounts", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;
    const adminName = adminData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminName = roomAdminData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");

    const guestId = guestData.response!.id!;
    const guestName = guestData.response!.displayName!;

    await test.step("Owner searches DocSpaceAdmin", async () => {
      await expect(async () => {
        const { data, status } =
          await ownerApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: adminName,
          });
        expect(status).toBe(200);
        const admin = (data.response as any[]).find(
          (u: any) => u.id === adminId,
        );
        expect(admin).toBeDefined();
        expect(admin.displayName).toBe(adminName);
        expect(admin.isAdmin).toBe(true);
        expect(admin.isOwner).toBe(false);
        expect(admin.isRoomAdmin).toBe(false);
        expect(admin.isVisitor).toBe(false);
        expect(admin.isCollaborator).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });

    await test.step("Owner searches RoomAdmin", async () => {
      await expect(async () => {
        const { data, status } =
          await ownerApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: roomAdminName,
          });
        expect(status).toBe(200);
        const roomAdmin = (data.response as any[]).find(
          (u: any) => u.id === roomAdminId,
        );
        expect(roomAdmin).toBeDefined();
        expect(roomAdmin.displayName).toBe(roomAdminName);
        expect(roomAdmin.isRoomAdmin).toBe(true);
        expect(roomAdmin.isAdmin).toBe(false);
        expect(roomAdmin.isOwner).toBe(false);
        expect(roomAdmin.isVisitor).toBe(false);
        expect(roomAdmin.isCollaborator).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });

    await test.step("Owner searches User", async () => {
      await expect(async () => {
        const { data, status } =
          await ownerApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: userName,
          });
        expect(status).toBe(200);
        const user = (data.response as any[]).find((u: any) => u.id === userId);
        expect(user).toBeDefined();
        expect(user.displayName).toBe(userName);
        expect(user.isCollaborator).toBe(true);
        expect(user.isAdmin).toBe(false);
        expect(user.isOwner).toBe(false);
        expect(user.isRoomAdmin).toBe(false);
        expect(user.isVisitor).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });

    await test.step("Owner searches Guest", async () => {
      await expect(async () => {
        const { data, status } =
          await ownerApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: guestName,
          });
        expect(status).toBe(200);
        const guest = (data.response as any[]).find(
          (u: any) => u.id === guestId,
        );
        expect(guest).toBeDefined();
        expect(guest.displayName).toBe(guestName);
        expect(guest.isVisitor).toBe(true);
        expect(guest.isAdmin).toBe(false);
        expect(guest.isOwner).toBe(false);
        expect(guest.isRoomAdmin).toBe(false);
        expect(guest.isCollaborator).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });
  });

  test("GET /people/filter - DocSpace admin searches accounts", async ({
    apiSdk,
  }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const ownerName = ownerData.response!.displayName!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminName = roomAdminData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;
    const guestName = guestData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminApi = apiSdk.forRole("docSpaceAdmin");

    // Bug 80587: API returns isAdmin: true for Owner, expected isAdmin: false
    await test.step.skip(
      "BUG 80587: DocSpace admin searches Owner",
      async () => {
        await expect(async () => {
          const { data, status } =
            await adminApi.peopleSearch.searchUsersByExtendedFilter({
              filterValue: ownerName,
            });
          expect(status).toBe(200);
          const owner = (data.response as any[]).find(
            (u: any) => u.id === ownerId,
          );
          expect(owner).toBeDefined();
          expect(owner.displayName).toBe(ownerName);
          expect(owner.isOwner).toBe(true);
          expect(owner.isAdmin).toBe(false);
          expect(owner.isRoomAdmin).toBe(false);
          expect(owner.isVisitor).toBe(false);
          expect(owner.isCollaborator).toBe(false);
        }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
      },
    );

    await test.step("DocSpace admin searches RoomAdmin", async () => {
      await expect(async () => {
        const { data, status } =
          await adminApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: roomAdminName,
          });
        expect(status).toBe(200);
        const roomAdmin = (data.response as any[]).find(
          (u: any) => u.id === roomAdminId,
        );
        expect(roomAdmin).toBeDefined();
        expect(roomAdmin.displayName).toBe(roomAdminName);
        expect(roomAdmin.isRoomAdmin).toBe(true);
        expect(roomAdmin.isAdmin).toBe(false);
        expect(roomAdmin.isOwner).toBe(false);
        expect(roomAdmin.isVisitor).toBe(false);
        expect(roomAdmin.isCollaborator).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });

    await test.step("DocSpace admin searches User", async () => {
      await expect(async () => {
        const { data, status } =
          await adminApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: userName,
          });
        expect(status).toBe(200);
        const user = (data.response as any[]).find((u: any) => u.id === userId);
        expect(user).toBeDefined();
        expect(user.displayName).toBe(userName);
        expect(user.isCollaborator).toBe(true);
        expect(user.isAdmin).toBe(false);
        expect(user.isOwner).toBe(false);
        expect(user.isRoomAdmin).toBe(false);
        expect(user.isVisitor).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });

    await test.step("DocSpace admin searches Guest", async () => {
      await expect(async () => {
        const { data, status } =
          await adminApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: guestName,
          });
        expect(status).toBe(200);
        const guest = (data.response as any[]).find(
          (u: any) => u.id === guestId,
        );
        expect(guest).toBeDefined();
        expect(guest.displayName).toBe(guestName);
        expect(guest.isVisitor).toBe(true);
        expect(guest.isAdmin).toBe(false);
        expect(guest.isOwner).toBe(false);
        expect(guest.isRoomAdmin).toBe(false);
        expect(guest.isCollaborator).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });
  });

  test("GET /people/filter - Room admin searches accounts", async ({
    apiSdk,
  }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const ownerName = ownerData.response!.displayName!;

    const { data: adminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminId = adminData.response!.id!;
    const adminName = adminData.response!.displayName!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userName = userData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    // Bug 80587: API returns isAdmin: true for Owner, expected isAdmin: false
    await test.step.skip("Room admin searches Owner", async () => {
      await expect(async () => {
        const { data, status } =
          await roomAdminApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: ownerName,
          });
        expect(status).toBe(200);
        const owner = (data.response as any[]).find(
          (u: any) => u.id === ownerId,
        );
        expect(owner).toBeDefined();
        expect(owner.displayName).toBe(ownerName);
        expect(owner.isOwner).toBe(true);
        expect(owner.isAdmin).toBe(false);
        expect(owner.isRoomAdmin).toBe(false);
        expect(owner.isVisitor).toBe(false);
        expect(owner.isCollaborator).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });

    await test.step("Room admin searches DocSpaceAdmin", async () => {
      await expect(async () => {
        const { data, status } =
          await roomAdminApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: adminName,
          });
        expect(status).toBe(200);
        const dsAdmin = (data.response as any[]).find(
          (u: any) => u.id === adminId,
        );
        expect(dsAdmin).toBeDefined();
        expect(dsAdmin.displayName).toBe(adminName);
        expect(dsAdmin.isAdmin).toBe(true);
        expect(dsAdmin.isOwner).toBe(false);
        expect(dsAdmin.isRoomAdmin).toBe(false);
        expect(dsAdmin.isVisitor).toBe(false);
        expect(dsAdmin.isCollaborator).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });

    await test.step("Room admin searches User", async () => {
      await expect(async () => {
        const { data, status } =
          await roomAdminApi.peopleSearch.searchUsersByExtendedFilter({
            filterValue: userName,
          });
        expect(status).toBe(200);
        const user = (data.response as any[]).find((u: any) => u.id === userId);
        expect(user).toBeDefined();
        expect(user.displayName).toBe(userName);
        expect(user.isCollaborator).toBe(true);
        expect(user.isAdmin).toBe(false);
        expect(user.isOwner).toBe(false);
        expect(user.isRoomAdmin).toBe(false);
        expect(user.isVisitor).toBe(false);
      }).toPass({ intervals: [2_000, 3_000, 5_000], timeout: 15_000 });
    });
  });
});
