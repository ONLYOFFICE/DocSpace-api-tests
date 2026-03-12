import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { RoomType, FileShare, EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /accounts/file/:id/search - Permissions", () => {
  test("GET /accounts/file/:id/search - User cannot search accounts for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search User Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile(roomId, {
      title: "Autotest Search File",
    });
    const fileId = fileData.response!.id!;

    const { data: userMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: userMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.getAccountsEntriesWithFilesShared(fileId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /accounts/file/:id/search - Guest cannot search accounts for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search Guest Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile(roomId, {
      title: "Autotest Search File",
    });
    const fileId = fileData.response!.id!;

    const { data: guestMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestMemberId = guestMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: guestMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.getAccountsEntriesWithFilesShared(fileId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /accounts/file/:id/search - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search Unauthorized",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile(roomId, {
      title: "Autotest Search File",
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.getAccountsEntriesWithFilesShared(fileId);

    expect(status).toBe(401);
  });
});

test.describe("GET /people/file/:id - Permissions", () => {
  test("GET /people/file/:id - User cannot search users for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users File User Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile(roomId, {
      title: "Autotest Users File",
    });
    const fileId = fileData.response!.id!;

    const { data: userMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: userMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.getUsersWithFilesShared(fileId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/file/:id - Guest cannot search users for file", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users File Guest Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile(roomId, {
      title: "Autotest Users File",
    });
    const fileId = fileData.response!.id!;

    const { data: guestMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestMemberId = guestMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: guestMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.getUsersWithFilesShared(fileId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/file/:id - 401 when unauthorized", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users File Unauthorized",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: fileData } = await ownerApi.files.createFile(roomId, {
      title: "Autotest Users File",
    });
    const fileId = fileData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.getUsersWithFilesShared(fileId);

    expect(status).toBe(401);
  });
});

test.describe("GET /accounts/folder/:id/search - Permissions", () => {
  test("GET /accounts/folder/:id/search - User cannot search accounts for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search Folder User Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder(roomId, {
      title: "Autotest Search Folder",
    });
    const folderId = folderData.response!.id!;

    const { data: userMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: userMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.getAccountsEntriesWithFoldersShared(folderId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /accounts/folder/:id/search - Guest cannot search accounts for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search Folder Guest Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder(roomId, {
      title: "Autotest Search Folder",
    });
    const folderId = folderData.response!.id!;

    const { data: guestMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestMemberId = guestMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: guestMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.getAccountsEntriesWithFoldersShared(folderId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /accounts/folder/:id/search - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search Folder Unauthorized",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder(roomId, {
      title: "Autotest Search Folder",
    });
    const folderId = folderData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.getAccountsEntriesWithFoldersShared(folderId);

    expect(status).toBe(401);
  });
});

test.describe("GET /people/folder/:id - Permissions", () => {
  test("GET /people/folder/:id - User cannot search users for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users Folder User Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder(roomId, {
      title: "Autotest Users Folder",
    });
    const folderId = folderData.response!.id!;

    const { data: userMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: userMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.getUsersWithFoldersShared(folderId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/folder/:id - Guest cannot search users for folder", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users Folder Guest Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder(roomId, {
      title: "Autotest Users Folder",
    });
    const folderId = folderData.response!.id!;

    const { data: guestMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestMemberId = guestMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: guestMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.getUsersWithFoldersShared(folderId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/folder/:id - 401 when unauthorized", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users Folder Unauthorized",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: folderData } = await ownerApi.folders.createFolder(roomId, {
      title: "Autotest Users Folder",
    });
    const folderId = folderData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.getUsersWithFoldersShared(folderId);

    expect(status).toBe(401);
  });
});

test.describe("GET /accounts/room/:id/search - Permissions", () => {
  test("GET /accounts/room/:id/search - User cannot search accounts for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search Room User Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: userMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: userMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.getAccountsEntriesWithRoomsShared(roomId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /accounts/room/:id/search - Guest cannot search accounts for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search Room Guest Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: guestMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestMemberId = guestMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: guestMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.getAccountsEntriesWithRoomsShared(roomId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /accounts/room/:id/search - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Search Room Unauthorized",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.getAccountsEntriesWithRoomsShared(roomId);

    expect(status).toBe(401);
  });
});

test.describe("GET /people/room/:id - Permissions", () => {
  test("GET /people/room/:id - User cannot search users for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users Room User Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: userMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userMemberId = userMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: userMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.getUsersWithRoomShared(roomId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/room/:id - Guest cannot search users for room", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users Room Guest Permissions",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { data: guestMemberData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const guestMemberId = guestMemberData.response!.id!;

    await ownerApi.rooms.setRoomSecurity(roomId, {
      invitations: [{ id: guestMemberId, access: FileShare.Editing }],
      notify: false,
    });

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.getUsersWithRoomShared(roomId);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/room/:id - 401 when unauthorized", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: roomData } = await ownerApi.rooms.createRoom({
      title: "Autotest Users Room Unauthorized",
      roomType: RoomType.CustomRoom,
    });
    const roomId = roomData.response!.id!;

    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.getUsersWithRoomShared(roomId);

    expect(status).toBe(401);
  });
});

test.describe("GET /accounts/search - Permissions", () => {
  test("GET /accounts/search - Room admin cannot search accounts", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    const { userData: adminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminEmail = adminUserData.email;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userEmail = userUserData.email;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestEmail = guestUserData.email;

    const roomAdminApi = apiSdk.forRole("roomAdmin");

    await test.step("RoomAdmin searches for Owner", async () => {
      const { data, status } =
        await roomAdminApi.peopleSearch.getSearch(ownerEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("RoomAdmin searches for DocSpaceAdmin", async () => {
      const { data, status } =
        await roomAdminApi.peopleSearch.getSearch(adminEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("RoomAdmin searches for User", async () => {
      const { data, status } =
        await roomAdminApi.peopleSearch.getSearch(userEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("RoomAdmin searches for Guest", async () => {
      const { data, status } =
        await roomAdminApi.peopleSearch.getSearch(guestEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });

  test("GET /accounts/search - User cannot search accounts", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    const { userData: adminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminEmail = adminUserData.email;

    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminUserData.email;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestEmail = guestUserData.email;

    const userApi = apiSdk.forRole("user");

    await test.step("User searches for Owner", async () => {
      const { data, status } = await userApi.peopleSearch.getSearch(ownerEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User searches for DocSpaceAdmin", async () => {
      const { data, status } = await userApi.peopleSearch.getSearch(adminEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User searches for RoomAdmin", async () => {
      const { data, status } =
        await userApi.peopleSearch.getSearch(roomAdminEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("User searches for Guest", async () => {
      const { data, status } = await userApi.peopleSearch.getSearch(guestEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });

  test("GET /accounts/search - Guest cannot search accounts", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    const { userData: adminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminEmail = adminUserData.email;

    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminUserData.email;

    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userEmail = userUserData.email;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const guestApi = apiSdk.forRole("guest");

    await test.step("Guest searches for Owner", async () => {
      const { data, status } =
        await guestApi.peopleSearch.getSearch(ownerEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest searches for DocSpaceAdmin", async () => {
      const { data, status } =
        await guestApi.peopleSearch.getSearch(adminEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest searches for RoomAdmin", async () => {
      const { data, status } =
        await guestApi.peopleSearch.getSearch(roomAdminEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });

    await test.step("Guest searches for User", async () => {
      const { data, status } = await guestApi.peopleSearch.getSearch(userEmail);
      expect(status).toBe(403);
      expect((data as any).error?.message).toContain("Access denied");
    });
  });

  test("GET /accounts/search - 401 when unauthorized", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    const { userData: adminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const adminEmail = adminUserData.email;

    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminUserData.email;

    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const userEmail = userUserData.email;

    const { userData: guestUserData } = await apiSdk.addMember(
      "owner",
      "Guest",
    );
    const guestEmail = guestUserData.email;

    const anonApi = apiSdk.forAnonymous();

    await test.step("Anonymous searches for Owner", async () => {
      const { status } = await anonApi.peopleSearch.getSearch(ownerEmail);
      expect(status).toBe(401);
    });

    await test.step("Anonymous searches for DocSpaceAdmin", async () => {
      const { status } = await anonApi.peopleSearch.getSearch(adminEmail);
      expect(status).toBe(401);
    });

    await test.step("Anonymous searches for RoomAdmin", async () => {
      const { status } = await anonApi.peopleSearch.getSearch(roomAdminEmail);
      expect(status).toBe(401);
    });

    await test.step("Anonymous searches for User", async () => {
      const { status } = await anonApi.peopleSearch.getSearch(userEmail);
      expect(status).toBe(401);
    });

    await test.step("Anonymous searches for Guest", async () => {
      const { status } = await anonApi.peopleSearch.getSearch(guestEmail);
      expect(status).toBe(401);
    });
  });
});

test.describe("GET /people/search - Permissions", () => {
  test("GET /people/search - Room admin cannot search users", async ({
    apiSdk,
  }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .peopleSearch.searchUsersByQuery(ownerEmail);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/search - User cannot search users", async ({ apiSdk }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.searchUsersByQuery(ownerEmail);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/search - Guest cannot search users", async ({ apiSdk }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.searchUsersByQuery(ownerEmail);

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/search - 401 when unauthorized", async ({ apiSdk }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.searchUsersByQuery(ownerEmail);

    expect(status).toBe(401);
  });
});

test.describe("GET /people/status/:status/search - Permissions", () => {
  test("GET /people/status/:status/search - Room admin cannot search users by status", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminApi = apiSdk.forRole("roomAdmin");

    const { data: activeData, status: activeStatus } =
      await roomAdminApi.peopleSearch.searchUsersByStatus(
        EmployeeStatus.Active,
        userEmail,
      );
    expect(activeStatus).toBe(403);
    expect((activeData as any).error?.message).toContain("Access denied");

    await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, {
      userIds: [userId],
    });

    const { data, status } =
      await roomAdminApi.peopleSearch.searchUsersByStatus(
        EmployeeStatus.Terminated,
        userEmail,
      );
    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/status/:status/search - User cannot search users by status", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;
    const userApi = apiSdk.forRole("user");

    const { data: activeData, status: activeStatus } =
      await userApi.peopleSearch.searchUsersByStatus(
        EmployeeStatus.Active,
        userEmail,
      );
    expect(activeStatus).toBe(403);
    expect((activeData as any).error?.message).toContain("Access denied");

    await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, {
      userIds: [userId],
    });

    const { data, status } =
      await userApi.peopleSearch.searchUsersByStatus(
        EmployeeStatus.Terminated,
        userEmail,
      );
    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/status/:status/search - Guest cannot search users by status", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestApi = apiSdk.forRole("guest");

    const { data: activeData, status: activeStatus } =
      await guestApi.peopleSearch.searchUsersByStatus(
        EmployeeStatus.Active,
        userEmail,
      );
    expect(activeStatus).toBe(403);
    expect((activeData as any).error?.message).toContain("Access denied");

    await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, {
      userIds: [userId],
    });

    const { data, status } =
      await guestApi.peopleSearch.searchUsersByStatus(
        EmployeeStatus.Terminated,
        userEmail,
      );
    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/status/:status/search - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.searchUsersByStatus(EmployeeStatus.Active, ownerEmail);

    expect(status).toBe(401);
  });
});

test.describe("GET /people/simple/filter - Permissions", () => {
  test("GET /people/simple/filter - Room admin cannot see guests invited by others", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestName = guestData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .peopleSearch.getSimpleByFilter(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        guestName,
      );

    expect(status).toBe(200);
    expect(
      (data.response as any[]).some((u: any) => u.displayName === guestName),
    ).toBe(false);
  });

  test("GET /people/simple/filter - User cannot get simple filter", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.getSimpleByFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/simple/filter - Guest cannot get simple filter", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.getSimpleByFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/simple/filter - 401 when unauthorized", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.getSimpleByFilter();

    expect(status).toBe(401);
  });
});

test.describe("GET /people/filter - Permissions", () => {
  test("GET /people/filter - Room admin cannot see guests invited by others", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestName = guestData.response!.displayName!;

    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .peopleSearch.searchUsersByExtendedFilter(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        guestName,
      );

    expect(status).toBe(200);
    expect(
      (data.response as any[]).some((u: any) => u.displayName === guestName),
    ).toBe(false);
  });

  test("GET /people/filter - User cannot get extended filter", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .peopleSearch.searchUsersByExtendedFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/filter - Guest cannot get extended filter", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .peopleSearch.searchUsersByExtendedFilter();

    expect(status).toBe(403);
    expect((data as any).error?.message).toContain("Access denied");
  });

  test("GET /people/filter - 401 when unauthorized", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .peopleSearch.searchUsersByExtendedFilter();

    expect(status).toBe(401);
  });
});
