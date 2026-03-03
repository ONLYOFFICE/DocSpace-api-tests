import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

type UsersListItem = {
  id?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  isRoomAdmin?: boolean;
  isCollaborator?: boolean;
  isVisitor?: boolean;
  status?: number;
};

test.describe("PUT /people/status/:status - Change user status", () => {
  test("PUT /people/status/:status - Owner deactivates the different type of users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [guestId, userId, roomAdminId, docSpaceAdminId],
      resendAll: false,
    };

    const { data } = await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, requestData);

    expect(data.statusCode).toBe(200);
    const guestInfo = data.response![0];
    expect(guestInfo.id).toBe(guestId);
    expect(guestInfo.status).toBe(EmployeeStatus.Terminated);
    expect(guestInfo.isVisitor).toBe(true);

    const userInfo = data.response![1];
    expect(userInfo.isCollaborator).toBe(true);
    expect(userInfo.status).toBe(EmployeeStatus.Terminated);
    expect(userInfo.id).toBe(userId);

    const roomAdminInfo = data.response![2];
    expect(roomAdminInfo.id).toBe(roomAdminId);
    expect(roomAdminInfo.status).toBe(EmployeeStatus.Terminated);

    expect(roomAdminInfo.isRoomAdmin).toBe(true);

    const docSpaceAdminInfo = data.response![3];
    expect(docSpaceAdminInfo.id).toBe(docSpaceAdminId);
    expect(docSpaceAdminInfo.status).toBe(EmployeeStatus.Terminated);
    expect(docSpaceAdminInfo.isAdmin).toBe(true);
  });

  test("PUT /people/status/:status - Owner activates the different type of users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [guestId, userId, roomAdminId, docSpaceAdminId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, requestData);

    const { data } = await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Active, requestData);

    expect(data.statusCode).toBe(200);
    const guestInfo = data.response![0];
    expect(guestInfo.id).toBe(guestId);
    expect(guestInfo.status).toBe(EmployeeStatus.Active);
    expect(guestInfo.isVisitor).toBe(true);

    const userInfo = data.response![1];
    expect(userInfo.isCollaborator).toBe(true);
    expect(userInfo.status).toBe(EmployeeStatus.Active);
    expect(userInfo.id).toBe(userId);

    const roomAdminInfo = data.response![2];
    expect(roomAdminInfo.id).toBe(roomAdminId);
    expect(roomAdminInfo.status).toBe(EmployeeStatus.Active);
    expect(roomAdminInfo.isRoomAdmin).toBe(true);

    const docSpaceAdminInfo = data.response![3];
    expect(docSpaceAdminInfo.id).toBe(docSpaceAdminId);
    expect(docSpaceAdminInfo.status).toBe(EmployeeStatus.Active);
    expect(docSpaceAdminInfo.isAdmin).toBe(true);
  });

  test("PUT /people/status/:status - DocSpace admin deactivates the different type of user", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const requestData = {
      userIds: [guestId, userId, roomAdminId],
      resendAll: false,
    };

    const { api: adminApi } = await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { data } = await adminApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, requestData);

    expect(data.statusCode).toBe(200);
    expect(data.response![0].isVisitor).toBe(true);
    expect(data.response![0].status).toBe(EmployeeStatus.Terminated);
    expect(data.response![0].id).toBe(guestId);
    expect(data.response![1].isCollaborator).toBe(true);
    expect(data.response![1].status).toBe(EmployeeStatus.Terminated);
    expect(data.response![1].id).toBe(userId);
    expect(data.response![2].isRoomAdmin).toBe(true);
    expect(data.response![2].status).toBe(EmployeeStatus.Terminated);
    expect(data.response![2].id).toBe(roomAdminId);
  });

  test("PUT /people/status/:status - DocSpace admin activates the different type of user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const requestData = {
      userIds: [userId, roomAdminId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, requestData);

    const { api: adminApi } = await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { data } = await adminApi.userStatus.updateUserStatus(EmployeeStatus.Active, requestData);

    expect(data.statusCode).toBe(200);
    expect(data.response![0].isCollaborator).toBe(true);
    expect(data.response![0].status).toBe(EmployeeStatus.Active);
    expect(data.response![0].id).toBe(userId);
    expect(data.response![1].isRoomAdmin).toBe(true);
    expect(data.response![1].status).toBe(EmployeeStatus.Active);
    expect(data.response![1].id).toBe(roomAdminId);
  });
});

test.describe("GET /people/status/:status - Get profiles by status", () => {
  test("GET /people/status/:status - Owner returns a list of profiles filtered by the active user status", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const { userData: roomAdminUserData } = await apiSdk.addMember("owner", "RoomAdmin");
    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const { userData: guestUserData } = await apiSdk.addMember("owner", "Guest");

    const { data } = await ownerApi.userStatus.getByStatus(EmployeeStatus.Active);
    const body = data as { response: UsersListItem[] };

    const docSpaceAdminData = body.response.find(
      (u: UsersListItem) => u.email === docSpaceAdminUserData.email,
    );
    expect(docSpaceAdminData).toBeTruthy();
    if (!docSpaceAdminData) {
      throw new Error(
        `DocSpace admin user not found in users list by email: ${docSpaceAdminUserData.email}`,
      );
    }
    expect(docSpaceAdminData.email).toBe(docSpaceAdminUserData.email);
    expect(docSpaceAdminData.status).toBe(EmployeeStatus.Active);
    expect(docSpaceAdminData.isAdmin).toBe(true);

    const roomAdminData = body.response.find(
      (u: UsersListItem) => u.email === roomAdminUserData.email,
    );
    expect(roomAdminData).toBeTruthy();
    if (!roomAdminData) {
      throw new Error(
        `Room admin user not found in users list by email: ${roomAdminUserData.email}`,
      );
    }
    expect(roomAdminData.email).toBe(roomAdminUserData.email);
    expect(roomAdminData.status).toBe(EmployeeStatus.Active);
    expect(roomAdminData.isRoomAdmin).toBe(true);

    const userData = body.response.find(
      (u: UsersListItem) => u.email === userUserData.email,
    );
    expect(userData).toBeTruthy();
    if (!userData) {
      throw new Error(
        `User not found in users list by email: ${userUserData.email}`,
      );
    }
    expect(userData.email).toBe(userUserData.email);
    expect(userData.status).toBe(EmployeeStatus.Active);
    expect(userData.isCollaborator).toBe(true);

    const guestData = body.response.find(
      (u: UsersListItem) => u.email === guestUserData.email,
    );
    expect(guestData).toBeTruthy();
    if (!guestData) {
      throw new Error(
        `Guest not found in users list by email: ${guestUserData.email}`,
      );
    }
    expect(guestData.email).toBe(guestUserData.email);
    expect(guestData.status).toBe(EmployeeStatus.Active);
    expect(guestData.isVisitor).toBe(true);
  });

  test("GET /people/status/:status - Owner returns a list of profiles filtered by the disabled user status", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: docSpaceAdminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const docSpaceAdminEmail = docSpaceAdminData.response!.email!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminEmail = roomAdminData.response!.email!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;
    const guestEmail = guestData.response!.email!;

    await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, {
      userIds: [docSpaceAdminId, roomAdminId, userId, guestId],
      resendAll: false,
    });

    const { data } = await ownerApi.userStatus.getByStatus(EmployeeStatus.Terminated);
    const body = data as { response: UsersListItem[] };

    const docSpaceAdminInfo = body.response.find(
      (u: UsersListItem) => u.email === docSpaceAdminEmail,
    );
    expect(docSpaceAdminInfo).toBeTruthy();
    if (!docSpaceAdminInfo) {
      throw new Error(`DocSpace admin user not found in users list by email: ${docSpaceAdminEmail}`);
    }
    expect(docSpaceAdminInfo.email).toBe(docSpaceAdminEmail);
    expect(docSpaceAdminInfo.status).toBe(EmployeeStatus.Terminated);
    expect(docSpaceAdminInfo.isAdmin).toBe(true);

    const roomAdminInfo = body.response.find(
      (u: UsersListItem) => u.email === roomAdminEmail,
    );
    expect(roomAdminInfo).toBeTruthy();
    if (!roomAdminInfo) {
      throw new Error(`Room admin user not found in users list by email: ${roomAdminEmail}`);
    }
    expect(roomAdminInfo.email).toBe(roomAdminEmail);
    expect(roomAdminInfo.status).toBe(EmployeeStatus.Terminated);
    expect(roomAdminInfo.isRoomAdmin).toBe(true);

    const userInfo = body.response.find(
      (u: UsersListItem) => u.email === userEmail,
    );
    expect(userInfo).toBeTruthy();
    if (!userInfo) {
      throw new Error(`User not found in users list by email: ${userEmail}`);
    }
    expect(userInfo.email).toBe(userEmail);
    expect(userInfo.status).toBe(EmployeeStatus.Terminated);
    expect(userInfo.isCollaborator).toBe(true);

    const guestInfo = body.response.find(
      (u: UsersListItem) => u.email === guestEmail,
    );
    expect(guestInfo).toBeTruthy();
    if (!guestInfo) {
      throw new Error(`Guest not found in users list by email: ${guestEmail}`);
    }
    expect(guestInfo.email).toBe(guestEmail);
    expect(guestInfo.status).toBe(EmployeeStatus.Terminated);
    expect(guestInfo.isVisitor).toBe(true);
  });

  test("GET /people/status/:status - DocSpace admin returns a list of profiles filtered by the active user status", async ({
    apiSdk,
  }) => {
    const { userData: docSpaceAdminUserData, api: adminApi } = await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { userData: roomAdminUserData } = await apiSdk.addMember("owner", "RoomAdmin");
    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const { userData: guestUserData } = await apiSdk.addMember("owner", "Guest");

    const { data } = await adminApi.userStatus.getByStatus(EmployeeStatus.Active);
    const body = data as { response: UsersListItem[] };

    const docSpaceAdminData = body.response.find(
      (u: UsersListItem) => u.email === docSpaceAdminUserData.email,
    );
    expect(docSpaceAdminData).toBeTruthy();
    if (!docSpaceAdminData) {
      throw new Error(
        `DocSpace admin user not found in users list by email: ${docSpaceAdminUserData.email}`,
      );
    }
    expect(docSpaceAdminData.email).toBe(docSpaceAdminUserData.email);
    expect(docSpaceAdminData.status).toBe(EmployeeStatus.Active);
    expect(docSpaceAdminData.isAdmin).toBe(true);

    const roomAdminData = body.response.find(
      (u: UsersListItem) => u.email === roomAdminUserData.email,
    );
    expect(roomAdminData).toBeTruthy();
    if (!roomAdminData) {
      throw new Error(
        `Room admin user not found in users list by email: ${roomAdminUserData.email}`,
      );
    }
    expect(roomAdminData.email).toBe(roomAdminUserData.email);
    expect(roomAdminData.status).toBe(EmployeeStatus.Active);
    expect(roomAdminData.isRoomAdmin).toBe(true);

    const userData = body.response.find(
      (u: UsersListItem) => u.email === userUserData.email,
    );
    expect(userData).toBeTruthy();
    if (!userData) {
      throw new Error(
        `User not found in users list by email: ${userUserData.email}`,
      );
    }
    expect(userData.email).toBe(userUserData.email);
    expect(userData.status).toBe(EmployeeStatus.Active);
    expect(userData.isCollaborator).toBe(true);

    const guestData = body.response.find(
      (u: UsersListItem) => u.email === guestUserData.email,
    );
    expect(guestData).toBeTruthy();
    if (!guestData) {
      throw new Error(
        `Guest not found in users list by email: ${guestUserData.email}`,
      );
    }
    expect(guestData.email).toBe(guestUserData.email);
    expect(guestData.status).toBe(EmployeeStatus.Active);
    expect(guestData.isVisitor).toBe(true);
  });

  test("GET /people/status/:status - DocSpace admin returns a list of profiles filtered by the disabled user status", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: docSpaceAdminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const docSpaceAdminEmail = docSpaceAdminData.response!.email!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;
    const roomAdminEmail = roomAdminData.response!.email!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const userEmail = userData.response!.email!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;
    const guestEmail = guestData.response!.email!;

    await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, {
      userIds: [docSpaceAdminId, roomAdminId, userId, guestId],
      resendAll: false,
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { data } = await adminApi.userStatus.getByStatus(EmployeeStatus.Terminated);
    const body = data as { response: UsersListItem[] };

    const docSpaceAdminInfo = body.response.find(
      (u: UsersListItem) => u.email === docSpaceAdminEmail,
    );
    expect(docSpaceAdminInfo).toBeTruthy();
    if (!docSpaceAdminInfo) {
      throw new Error(`DocSpace admin user not found in users list by email: ${docSpaceAdminEmail}`);
    }
    expect(docSpaceAdminInfo.email).toBe(docSpaceAdminEmail);
    expect(docSpaceAdminInfo.status).toBe(EmployeeStatus.Terminated);
    expect(docSpaceAdminInfo.isAdmin).toBe(true);

    const roomAdminInfo = body.response.find(
      (u: UsersListItem) => u.email === roomAdminEmail,
    );
    expect(roomAdminInfo).toBeTruthy();
    if (!roomAdminInfo) {
      throw new Error(`Room admin user not found in users list by email: ${roomAdminEmail}`);
    }
    expect(roomAdminInfo.email).toBe(roomAdminEmail);
    expect(roomAdminInfo.status).toBe(EmployeeStatus.Terminated);
    expect(roomAdminInfo.isRoomAdmin).toBe(true);

    const userInfo = body.response.find(
      (u: UsersListItem) => u.email === userEmail,
    );
    expect(userInfo).toBeTruthy();
    if (!userInfo) {
      throw new Error(`User not found in users list by email: ${userEmail}`);
    }
    expect(userInfo.email).toBe(userEmail);
    expect(userInfo.status).toBe(EmployeeStatus.Terminated);
    expect(userInfo.isCollaborator).toBe(true);

    const guestInfo = body.response.find(
      (u: UsersListItem) => u.email === guestEmail,
    );
    expect(guestInfo).toBeTruthy();
    if (!guestInfo) {
      throw new Error(`Guest not found in users list by email: ${guestEmail}`);
    }
    expect(guestInfo.email).toBe(guestEmail);
    expect(guestInfo.status).toBe(EmployeeStatus.Terminated);
    expect(guestInfo.isVisitor).toBe(true);
  });

  test("GET /people/status/:status - Room admin returns a list of profiles filtered by the active user status", async ({
    apiSdk,
  }) => {
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const { userData: roomAdminUserData, api: roomAdminApi } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { userData: userUserData } = await apiSdk.addMember("owner", "User");

    const { data } = await roomAdminApi.userStatus.getByStatus(EmployeeStatus.Active);
    const body = data as { response: UsersListItem[] };

    const docSpaceAdminData = body.response.find(
      (u: UsersListItem) => u.email === docSpaceAdminUserData.email,
    );
    expect(docSpaceAdminData).toBeTruthy();
    if (!docSpaceAdminData) {
      throw new Error(
        `DocSpace admin user not found in users list by email: ${docSpaceAdminUserData.email}`,
      );
    }
    expect(docSpaceAdminData.email).toBe(docSpaceAdminUserData.email);
    expect(docSpaceAdminData.status).toBe(EmployeeStatus.Active);
    expect(docSpaceAdminData.isAdmin).toBe(true);

    const roomAdminData = body.response.find(
      (u: UsersListItem) => u.email === roomAdminUserData.email,
    );
    expect(roomAdminData).toBeTruthy();
    if (!roomAdminData) {
      throw new Error(
        `Room admin user not found in users list by email: ${roomAdminUserData.email}`,
      );
    }
    expect(roomAdminData.email).toBe(roomAdminUserData.email);
    expect(roomAdminData.status).toBe(EmployeeStatus.Active);
    expect(roomAdminData.isRoomAdmin).toBe(true);

    const userData = body.response.find(
      (u: UsersListItem) => u.email === userUserData.email,
    );
    expect(userData).toBeTruthy();
    if (!userData) {
      throw new Error(
        `User not found in users list by email: ${userUserData.email}`,
      );
    }
    expect(userData.email).toBe(userUserData.email);
    expect(userData.status).toBe(EmployeeStatus.Active);
    expect(userData.isCollaborator).toBe(true);
  });

  test("GET /people/status/:status - Room admin returns a list of profiles filtered by the disabled user status", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: docSpaceAdminData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    await ownerApi.userStatus.updateUserStatus(EmployeeStatus.Terminated, {
      userIds: [docSpaceAdminId, roomAdminId, userId, guestId],
      resendAll: false,
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { data } = await roomAdminApi.userStatus.getByStatus(EmployeeStatus.Terminated);
    const responseData = data as Record<string, unknown>;

    expect(responseData.statusCode).toBe(200);
    expect(responseData.count).toBe(0);
    expect(responseData.total).toBe(0);
  });
});

//TODO: Write tests from different users to activate / disabled users
