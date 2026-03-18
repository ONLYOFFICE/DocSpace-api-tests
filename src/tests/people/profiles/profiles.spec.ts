import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { faker } from "@faker-js/faker";
import {
  EmployeeType,
  EmployeeStatus,
  EmployeeFullDto,
} from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

type UsersListItem = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  isOwner?: boolean;
  isAdmin?: boolean;
  isRoomAdmin?: boolean;
  isCollaborator?: boolean;
};

test.describe("API profile methods", () => {
  test("Owner create Guest", async ({ apiSdk }) => {
    const { data } = await apiSdk.addMember("owner", "Guest");
    expect(data.statusCode).toBe(200);
    expect(data.response!.isCollaborator).toBe(false);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.isVisitor).toBe(true);
    expect(data.response!.isAdmin).toBe(false);
    expect(data.response!.isRoomAdmin).toBe(false);
    expect(data.response!.isLDAP).toBe(false);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("BUG 80020: POST /people - Owner create User", async ({ apiSdk }) => {
    const { data } = await apiSdk.addMember("owner", "User");
    expect(data.statusCode).toBe(200);
    expect(data.response!.isCollaborator).toBe(true);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.isVisitor).toBe(false);
    expect(data.response!.isAdmin).toBe(false);
    expect(data.response!.isRoomAdmin).toBe(false);
    expect(data.response!.isLDAP).toBe(false);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("POST /people - Owner create Room Admin", async ({ apiSdk }) => {
    const { data } = await apiSdk.addMember("owner", "RoomAdmin");
    expect(data.statusCode).toBe(200);
    expect(data.response!.isCollaborator).toBe(false);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.isVisitor).toBe(false);
    expect(data.response!.isAdmin).toBe(false);
    expect(data.response!.isRoomAdmin).toBe(true);
    expect(data.response!.isLDAP).toBe(false);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("POST /people - Owner create DocSpace Admin", async ({ apiSdk }) => {
    const { data } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    expect(data.statusCode).toBe(200);
    expect(data.response!.isCollaborator).toBe(false);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.isVisitor).toBe(false);
    expect(data.response!.isAdmin).toBe(true);
    expect(data.response!.isRoomAdmin).toBe(false);
    expect(data.response!.isLDAP).toBe(false);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("POST /people - DocSpace admin creates Room admin", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data } = await apiSdk.addMember("docSpaceAdmin", "RoomAdmin");
    expect(data.statusCode).toBe(200);
    expect(data.response!.isCollaborator).toBe(false);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.isVisitor).toBe(false);
    expect(data.response!.isAdmin).toBe(false);
    expect(data.response!.isRoomAdmin).toBe(true);
    expect(data.response!.isLDAP).toBe(false);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("POST /people - DocSpace admin creates user", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data } = await apiSdk.addMember("docSpaceAdmin", "User");
    expect(data.statusCode).toBe(200);
    expect(data.response!.isCollaborator).toBe(true);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.isVisitor).toBe(false);
    expect(data.response!.isAdmin).toBe(false);
    expect(data.response!.isRoomAdmin).toBe(false);
    expect(data.response!.isLDAP).toBe(false);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("POST /people - Room admin creates User", async ({ apiSdk }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data } = await apiSdk.addMember("roomAdmin", "User");
    expect(data.statusCode).toBe(200);
    expect(data.response!.isCollaborator).toBe(true);
    expect(data.response!.isOwner).toBe(false);
    expect(data.response!.isVisitor).toBe(false);
    expect(data.response!.isAdmin).toBe(false);
    expect(data.response!.isRoomAdmin).toBe(false);
    expect(data.response!.isLDAP).toBe(false);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people - Owner returns all users list", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const { userData: userUserData } = await apiSdk.addMember("owner", "User");
    const { data, status } = await ownerApi.profiles.getAllProfiles();
    const body = data as { response: UsersListItem[]; statusCode: number };

    const owner = body.response.find(
      (u: UsersListItem) => u.email === config.DOCSPACE_OWNER_EMAIL,
    );
    expect(status).toBe(200);
    expect(owner).toBeTruthy();
    if (!owner) {
      throw new Error(
        `Owner user not found in users list by email: ${config.DOCSPACE_OWNER_EMAIL}`,
      );
    }
    expect(owner.firstName).toBe("admin-zero");
    expect(owner.lastName).toBe("admin-zero");
    expect(owner.email).toBe(config.DOCSPACE_OWNER_EMAIL);
    expect(owner.isOwner).toBe(true);
    expect(owner.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const docspaceAdmin = body.response.find(
      (u: UsersListItem) => u.email === docSpaceAdminUserData.email,
    );
    expect(docspaceAdmin).toBeTruthy();
    if (!docspaceAdmin) {
      throw new Error(
        `DocSpace admin user not found in users list by email: ${docSpaceAdminUserData.email}`,
      );
    }
    expect(docspaceAdmin.firstName).toBe(docSpaceAdminUserData.firstName);
    expect(docspaceAdmin.lastName).toBe(docSpaceAdminUserData.lastName);
    expect(docspaceAdmin.email).toBe(docSpaceAdminUserData.email);
    expect(docspaceAdmin.isAdmin).toBe(true);
    expect(docspaceAdmin.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const roomAdmin = body.response.find(
      (u: UsersListItem) => u.email === roomAdminUserData.email,
    );
    expect(roomAdmin).toBeTruthy();
    if (!roomAdmin) {
      throw new Error(
        `Room admin user not found in users list by email: ${roomAdminUserData.email}`,
      );
    }
    expect(roomAdmin.firstName).toBe(roomAdminUserData.firstName);
    expect(roomAdmin.lastName).toBe(roomAdminUserData.lastName);
    expect(roomAdmin.email).toBe(roomAdminUserData.email);
    expect(roomAdmin.isRoomAdmin).toBe(true);
    expect(roomAdmin.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const user = body.response.find(
      (u: UsersListItem) => u.email === userUserData.email,
    );
    expect(user).toBeTruthy();
    if (!user) {
      throw new Error(
        `User not found in users list by email: ${userUserData.email}`,
      );
    }
    expect(user.firstName).toBe(userUserData.firstName);
    expect(user.lastName).toBe(userUserData.lastName);
    expect(user.email).toBe(userUserData.email);
    expect(user.isCollaborator).toBe(true);
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people - DocSpace admin returns all users list", async ({
    apiSdk,
  }) => {
    const { userData: docSpaceAdminUserData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { userData: roomAdminUserData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const { userData: userUserData } = await apiSdk.addMember("owner", "User");

    const { data, status } = await adminApi.profiles.getAllProfiles();
    const body = data as { response: UsersListItem[]; statusCode: number };

    const owner = body.response.find(
      (u: UsersListItem) => u.email === config.DOCSPACE_OWNER_EMAIL,
    );
    expect(status).toBe(200);
    expect(owner).toBeTruthy();
    if (!owner) {
      throw new Error(
        `Owner user not found in users list by email: ${config.DOCSPACE_OWNER_EMAIL}`,
      );
    }
    expect(owner.firstName).toBe("admin-zero");
    expect(owner.lastName).toBe("admin-zero");
    expect(owner.email).toBe(config.DOCSPACE_OWNER_EMAIL);
    expect(owner.isOwner).toBe(true);
    expect(owner.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const docspaceAdmin = body.response.find(
      (u: UsersListItem) => u.email === docSpaceAdminUserData.email,
    );
    expect(docspaceAdmin).toBeTruthy();
    if (!docspaceAdmin) {
      throw new Error(
        `DocSpace admin user not found in users list by email: ${docSpaceAdminUserData.email}`,
      );
    }
    expect(docspaceAdmin.firstName).toBe(docSpaceAdminUserData.firstName);
    expect(docspaceAdmin.lastName).toBe(docSpaceAdminUserData.lastName);
    expect(docspaceAdmin.email).toBe(docSpaceAdminUserData.email);
    expect(docspaceAdmin.isAdmin).toBe(true);
    expect(docspaceAdmin.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const roomAdmin = body.response.find(
      (u: UsersListItem) => u.email === roomAdminUserData.email,
    );
    expect(roomAdmin).toBeTruthy();
    if (!roomAdmin) {
      throw new Error(
        `Room admin user not found in users list by email: ${roomAdminUserData.email}`,
      );
    }
    expect(roomAdmin.firstName).toBe(roomAdminUserData.firstName);
    expect(roomAdmin.lastName).toBe(roomAdminUserData.lastName);
    expect(roomAdmin.email).toBe(roomAdminUserData.email);
    expect(roomAdmin.isRoomAdmin).toBe(true);
    expect(roomAdmin.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const user = body.response.find(
      (u: UsersListItem) => u.email === userUserData.email,
    );
    expect(user).toBeTruthy();
    if (!user) {
      throw new Error(
        `User not found in users list by email: ${userUserData.email}`,
      );
    }
    expect(user.firstName).toBe(userUserData.firstName);
    expect(user.lastName).toBe(userUserData.lastName);
    expect(user.email).toBe(userUserData.email);
    expect(user.isCollaborator).toBe(true);
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people - Room admin returns all users list", async ({
    apiSdk,
  }) => {
    const { userData: docSpaceAdminUserData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { userData: roomAdminUserData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { userData: userUserData } = await apiSdk.addMember("owner", "User");

    const { data, status } = await roomAdminApi.profiles.getAllProfiles();
    const body = data as { response: UsersListItem[]; statusCode: number };

    const owner = body.response.find(
      (u: UsersListItem) => u.email === config.DOCSPACE_OWNER_EMAIL,
    );
    expect(status).toBe(200);
    expect(owner).toBeTruthy();
    if (!owner) {
      throw new Error(
        `Owner user not found in users list by email: ${config.DOCSPACE_OWNER_EMAIL}`,
      );
    }
    expect(owner.firstName).toBe("admin-zero");
    expect(owner.lastName).toBe("admin-zero");
    expect(owner.email).toBe(config.DOCSPACE_OWNER_EMAIL);
    expect(owner.isOwner).toBe(true);
    expect(owner.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const docspaceAdmin = body.response.find(
      (u: UsersListItem) => u.email === docSpaceAdminUserData.email,
    );
    expect(docspaceAdmin).toBeTruthy();
    if (!docspaceAdmin) {
      throw new Error(
        `DocSpace admin user not found in users list by email: ${docSpaceAdminUserData.email}`,
      );
    }
    expect(docspaceAdmin.firstName).toBe(docSpaceAdminUserData.firstName);
    expect(docspaceAdmin.lastName).toBe(docSpaceAdminUserData.lastName);
    expect(docspaceAdmin.email).toBe(docSpaceAdminUserData.email);
    expect(docspaceAdmin.isAdmin).toBe(true);
    expect(docspaceAdmin.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const roomAdmin = body.response.find(
      (u: UsersListItem) => u.email === roomAdminUserData.email,
    );
    expect(roomAdmin).toBeTruthy();
    if (!roomAdmin) {
      throw new Error(
        `Room admin user not found in users list by email: ${roomAdminUserData.email}`,
      );
    }
    expect(roomAdmin.firstName).toBe(roomAdminUserData.firstName);
    expect(roomAdmin.lastName).toBe(roomAdminUserData.lastName);
    expect(roomAdmin.email).toBe(roomAdminUserData.email);
    expect(roomAdmin.isRoomAdmin).toBe(true);
    expect(roomAdmin.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const user = body.response.find(
      (u: UsersListItem) => u.email === userUserData.email,
    );
    expect(user).toBeTruthy();
    if (!user) {
      throw new Error(
        `User not found in users list by email: ${userUserData.email}`,
      );
    }
    expect(user.firstName).toBe(userUserData.firstName);
    expect(user.lastName).toBe(userUserData.lastName);
    expect(user.email).toBe(userUserData.email);
    expect(user.isCollaborator).toBe(true);
    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("POST /people/invite - Owner invites docspace admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = faker.internet.email();

    const { data } = await ownerApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.DocSpaceAdmin, email }],
    } });
    const invitedUser = data.response![0];
    expect(data.statusCode).toBe(200);
    expect(invitedUser.displayName).toBe(email);
    expect(invitedUser.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.count).toBe(1);
    expect(invitedUser.hasAvatar).toBe(false);
    expect(invitedUser.isAnonim).toBe(false);
  });

  test("POST /people/invite - Owner invites room admin", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = faker.internet.email();

    const { data } = await ownerApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.RoomAdmin, email }],
    } });
    const invitedUser = data.response![0];
    expect(data.statusCode).toBe(200);
    expect(invitedUser.displayName).toBe(email);
    expect(invitedUser.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.count).toBe(1);
    expect(invitedUser.hasAvatar).toBe(false);
    expect(invitedUser.isAnonim).toBe(false);
  });

  test("POST /people/invite - Owner invites user", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = faker.internet.email();
    const { data } = await ownerApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.User, email }],
    } });
    const invitedUser = data.response![0];
    expect(data.statusCode).toBe(200);
    expect(invitedUser.displayName).toBe(email);
    expect(invitedUser.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.count).toBe(1);
    expect(invitedUser.hasAvatar).toBe(false);
    expect(invitedUser.isAnonim).toBe(false);
  });

  test("POST /people/invite - DocSpace admin invites room admin", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const email = faker.internet.email();

    const { data } = await adminApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.RoomAdmin, email }],
    } });
    const invitedUser = data.response!.find(
      (user) => user.displayName === email,
    );
    expect(data.statusCode).toBe(200);
    expect(invitedUser).toBeDefined();
    expect(invitedUser!.displayName).toBe(email);
    expect(invitedUser!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.count).toBe(2);
    expect(invitedUser!.hasAvatar).toBe(false);
    expect(invitedUser!.isAnonim).toBe(false);
  });

  test("POST /people/invite - DocSpace admin invites user", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const email = faker.internet.email();

    const { data } = await adminApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.User, email }],
    } });
    const invitedUser = data.response!.find(
      (user) => user.displayName === email,
    );
    expect(data.statusCode).toBe(200);
    expect(invitedUser).toBeDefined();
    expect(invitedUser!.displayName).toBe(email);
    expect(invitedUser!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.count).toBe(2);
    expect(invitedUser!.hasAvatar).toBe(false);
    expect(invitedUser!.isAnonim).toBe(false);
  });

  test("POST /people/invite - Room admin invites user", async ({ apiSdk }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const email = faker.internet.email();

    const { data } = await roomAdminApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.User, email }],
    } });
    expect(data.statusCode).toBe(200);
    const invitedUser = data.response!.find((u) => u.displayName === email);
    expect(invitedUser!.displayName).toBe(email);
    expect(invitedUser!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.count).toBe(2);
    expect(invitedUser!.hasAvatar).toBe(false);
    expect(invitedUser!.isAnonim).toBe(false);
  });

  test("PUT /people/invite - Owner resend activation emails ", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = faker.internet.email();
    const { data: inviteData } = await ownerApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.DocSpaceAdmin, email }],
    } });
    const invitedUser = inviteData.response!.find(
      (u) => u.displayName === email,
    )!;

    const { data } = await ownerApi.profiles.resendUserInvites({ updateMembersRequestDto: {
      userIds: [invitedUser.id as string],
      resendAll: false,
    } });
    const resendUser = data.response![0];
    expect(data.statusCode).toBe(200);
    expect(resendUser.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(resendUser.email).toBe(email);
    expect(resendUser.hasAvatar).toBe(false);
    expect(resendUser.isAnonim).toBe(false);
    expect(resendUser.status).toBe(4);
    expect(resendUser.activationStatus).toBe(2);
  });

  test("PUT /people/invite - DocSpace admin resend activation emails ", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const email = faker.internet.email();
    const { data: inviteData } = await adminApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.RoomAdmin, email }],
    } });
    const invitedUser = inviteData.response!.find(
      (u) => u.displayName === email,
    )!;

    const { data } = await adminApi.profiles.resendUserInvites({ updateMembersRequestDto: {
      userIds: [invitedUser.id as string],
      resendAll: false,
    } });
    const resendUser = data.response![0];
    expect(data.statusCode).toBe(200);
    expect(resendUser.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(resendUser.email).toBe(email);
    expect(resendUser.hasAvatar).toBe(false);
    expect(resendUser.isAnonim).toBe(false);
    expect(resendUser.status).toBe(4);
    expect(resendUser.activationStatus).toBe(2);
  });

  test("PUT /people/invite - Room admin resend activation emails ", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const email = faker.internet.email();
    const { data: inviteData } = await roomAdminApi.profiles.inviteUsers({ inviteUsersRequestDto: {
      invitations: [{ type: EmployeeType.User, email }],
    } });
    const invitedUser = inviteData.response!.find(
      (u) => u.displayName === email,
    )!;

    const { data } = await roomAdminApi.profiles.resendUserInvites({ updateMembersRequestDto: {
      userIds: [invitedUser.id as string],
      resendAll: false,
    } });
    const resendUser = data.response![0];
    expect(data.statusCode).toBe(200);
    expect(resendUser.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(resendUser.email).toBe(email);
    expect(resendUser.hasAvatar).toBe(false);
    expect(resendUser.isAnonim).toBe(false);
    expect(resendUser.status).toBe(4);
    expect(resendUser.activationStatus).toBe(2);
  });

  test("DELETE /people/:userIds - Owner deletes a deactivated user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const userDataChangeStatus = {
      userIds: [userId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({ status:
      EmployeeStatus.Terminated,
      updateMembersRequestDto: userDataChangeStatus,
    });
    const { data } = await ownerApi.profiles.deleteMember({ userid: userId });
    expect(data.statusCode).toBe(200);
    expect(data.links![0].action).toBe("DELETE");
    expect((data.response as unknown as EmployeeFullDto).id).toBe(userId);
  });

  test("DELETE /people/:userIds - Owner deletes a deactivated guest", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "Guest");
    const userId = userData.response!.id!;

    const userDataChangeStatus = {
      userIds: [userId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({ status:
      EmployeeStatus.Terminated,
      updateMembersRequestDto: userDataChangeStatus,
    });
    const { data } = await ownerApi.profiles.deleteMember({ userid: userId });
    expect(data.statusCode).toBe(200);
    expect(data.links![0].action).toBe("DELETE");
    expect((data.response as unknown as EmployeeFullDto).id).toBe(userId);
  });

  test("DELETE /people/:userIds - Owner deletes a deactivated docspace admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "DocSpaceAdmin");
    const userId = userData.response!.id!;

    const userDataChangeStatus = {
      userIds: [userId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({ status:
      EmployeeStatus.Terminated,
      updateMembersRequestDto: userDataChangeStatus,
    });
    const { data } = await ownerApi.profiles.deleteMember({ userid: userId });
    expect(data.statusCode).toBe(200);
    expect(data.links![0].action).toBe("DELETE");
    expect((data.response as unknown as EmployeeFullDto).id).toBe(userId);
  });

  test("DELETE /people/:userIds - Owner deletes a deactivated room admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;

    const userDataChangeStatus = {
      userIds: [userId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({ status:
      EmployeeStatus.Terminated,
      updateMembersRequestDto: userDataChangeStatus,
    });
    const { data } = await ownerApi.profiles.deleteMember({ userid: userId });
    expect(data.statusCode).toBe(200);
    expect(data.links![0].action).toBe("DELETE");
    expect((data.response as unknown as EmployeeFullDto).id).toBe(userId);
  });

  test("DELETE /people/:userIds - DocSpace admin deletes a deactivated room admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    // Create first DocSpace admin that will be deleted
    const { data: userToDeleteData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const userIdToDelete = userToDeleteData.response!.id!;

    // Disable the first DocSpace admin
    const userDataChangeStatus = {
      userIds: [userIdToDelete],
      resendAll: false,
    };
    await ownerApi.userStatus.updateUserStatus({ status:
      EmployeeStatus.Terminated,
      updateMembersRequestDto: userDataChangeStatus,
    });

    // Create second DocSpace admin that will perform the deletion
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.profiles.deleteMember({ userid: userIdToDelete });
    expect(data.statusCode).toBe(200);
    expect(data.links![0].action).toBe("DELETE");
    expect((data.response as unknown as EmployeeFullDto).id).toBe(
      userIdToDelete,
    );
  });

  test("DELETE /people/:userIds - DocSpace admin deletes a deactivated user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    // Create first DocSpace admin that will be deleted
    const { data: userToDeleteData } = await apiSdk.addMember("owner", "User");
    const userIdToDelete = userToDeleteData.response!.id!;

    // Disable the first DocSpace admin
    const userDataChangeStatus = {
      userIds: [userIdToDelete],
      resendAll: false,
    };
    await ownerApi.userStatus.updateUserStatus({ status:
      EmployeeStatus.Terminated,
      updateMembersRequestDto: userDataChangeStatus,
    });

    // Create second DocSpace admin that will perform the deletion
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.profiles.deleteMember({ userid: userIdToDelete });
    expect(data.statusCode).toBe(200);
    expect(data.links![0].action).toBe("DELETE");
    expect((data.response as unknown as EmployeeFullDto).id).toBe(
      userIdToDelete,
    );
  });

  test("GET /people/:userIds - Owner returns detailed information of a user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;

    const { data } = await ownerApi.profiles.getProfileByUserId({ userid: userId });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.email).toBe(userData.response!.email);
  });

  test("GET /people/:userIds - DocSpace admin returns detailed information of a user", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: listData } = await adminApi.profiles.getAllProfiles();
    const body = listData as { response: UsersListItem[] };
    const owner = body.response.find(
      (u: UsersListItem) => u.email === config.DOCSPACE_OWNER_EMAIL,
    );
    if (!owner) {
      throw new Error(
        `Owner not found with email: ${config.DOCSPACE_OWNER_EMAIL}`,
      );
    }
    const userId = owner.id;
    const { data } = await adminApi.profiles.getProfileByUserId({ userid: userId });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.email).toBe(owner.email);
    expect(data.response!.firstName).toBe(owner.firstName);
    expect(data.response!.lastName).toBe(owner.lastName);
  });

  test("GET /people/:userIds - Room admin returns detailed information of a user", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data: listData } = await roomAdminApi.profiles.getAllProfiles();
    const body = listData as { response: UsersListItem[] };
    const owner = body.response.find(
      (u: UsersListItem) => u.email === config.DOCSPACE_OWNER_EMAIL,
    );
    if (!owner) {
      throw new Error(
        `Owner not found with email: ${config.DOCSPACE_OWNER_EMAIL}`,
      );
    }
    const userId = owner.id;
    const { data } = await roomAdminApi.profiles.getProfileByUserId({ userid: userId });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.email).toBe(owner.email);
    expect(data.response!.firstName).toBe(owner.firstName);
    expect(data.response!.lastName).toBe(owner.lastName);
  });

  test("PUT /people/:userId - Updating owner profile data", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
    const listBody = listData as { response: UsersListItem[] };
    const userId = listBody.response[0].id;
    const userData = {
      firstName: faker.person.firstName().replace(/[^a-zA-Z]/g, ""),
      lastName: faker.person.lastName().replace(/[^a-zA-Z]/g, ""),
    };

    const { data } = await ownerApi.profiles.updateMember({ userid: userId, updateMemberRequestDto: userData });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.firstName).toBe(userData.firstName);
    expect(data.response!.lastName).toBe(userData.lastName);
    expect(data.response!.displayName).toBe(
      userData.firstName + " " + userData.lastName,
    );
  });

  test("PUT /people/:userId - Updating DocSpace admin profile data", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const userId = memberData.response!.id!;

    const userData = {
      firstName: faker.person.firstName().replace(/[^a-zA-Z]/g, ""),
      lastName: faker.person.lastName().replace(/[^a-zA-Z]/g, ""),
    };

    const { data } = await adminApi.profiles.updateMember({ userid: userId, updateMemberRequestDto: userData });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.firstName).toBe(userData.firstName);
    expect(data.response!.lastName).toBe(userData.lastName);
    expect(data.response!.displayName).toBe(
      userData.firstName + " " + userData.lastName,
    );
    expect(data.response!.isAdmin).toBe(true);
  });

  test("PUT /people/:userId - Updating room admin profile data", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const userId = memberData.response!.id!;

    const userData = {
      firstName: faker.person.firstName().replace(/[^a-zA-Z]/g, ""),
      lastName: faker.person.lastName().replace(/[^a-zA-Z]/g, ""),
    };

    const { data } = await roomAdminApi.profiles.updateMember({ userid: userId, updateMemberRequestDto: userData });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.firstName).toBe(userData.firstName);
    expect(data.response!.lastName).toBe(userData.lastName);
    expect(data.response!.displayName).toBe(
      userData.firstName + " " + userData.lastName,
    );
    expect(data.response!.isRoomAdmin).toBe(true);
  });

  test("BUG 79994: PUT /people/:userId - Updating user profile data", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    const userData = {
      firstName: faker.person.firstName().replace(/[^a-zA-Z]/g, ""),
      lastName: faker.person.lastName().replace(/[^a-zA-Z]/g, ""),
    };

    const { data } = await userApi.profiles.updateMember({ userid: userId, updateMemberRequestDto: userData });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.firstName).toBe(userData.firstName);
    expect(data.response!.lastName).toBe(userData.lastName);
    expect(data.response!.displayName).toBe(
      userData.firstName + " " + userData.lastName,
    );
    expect(data.response!.isCollaborator).toBe(true);
  });

  test("PUT /people/:userId - Updating guest profile data", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const userId = memberData.response!.id!;

    const userData = {
      firstName: faker.person.firstName().replace(/[^a-zA-Z]/g, ""),
      lastName: faker.person.lastName().replace(/[^a-zA-Z]/g, ""),
    };

    const { data } = await guestApi.profiles.updateMember({ userid: userId, updateMemberRequestDto: userData });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.firstName).toBe(userData.firstName);
    expect(data.response!.lastName).toBe(userData.lastName);
    expect(data.response!.displayName).toBe(
      userData.firstName + " " + userData.lastName,
    );
    expect(data.response!.isVisitor).toBe(true);
  });

  test("GET /people/@self - Owner receives information about himself", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data } = await ownerApi.profiles.getSelfProfile();
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe("admin-zero");
    expect(data.response!.lastName).toBe("admin-zero");
    expect(data.response!.displayName).toBe("admin-zero admin-zero");
    expect(data.response!.isAdmin).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.response!.hasPersonalFolder).toBe(true);
  });

  test("GET /people/@self - DocSpace admin receives information about himself", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const { data } = await adminApi.profiles.getSelfProfile();
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(memberData.response!.firstName);
    expect(data.response!.lastName).toBe(memberData.response!.lastName);
    expect(data.response!.displayName).toBe(memberData.response!.displayName);
    expect(data.response!.isAdmin).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.response!.hasPersonalFolder).toBe(true);
  });

  test("GET /people/@self - Room admin receives information about himself", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const { data } = await roomAdminApi.profiles.getSelfProfile();
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(memberData.response!.firstName);
    expect(data.response!.lastName).toBe(memberData.response!.lastName);
    expect(data.response!.displayName).toBe(memberData.response!.displayName);
    expect(data.response!.isRoomAdmin).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.response!.hasPersonalFolder).toBe(true);
  });

  test("GET /people/@self - User receives information about himself", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const { data } = await userApi.profiles.getSelfProfile();
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(memberData.response!.firstName);
    expect(data.response!.lastName).toBe(memberData.response!.lastName);
    expect(data.response!.displayName).toBe(memberData.response!.displayName);
    expect(data.response!.isCollaborator).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.response!.hasPersonalFolder).toBe(true);
  });

  test("GET /people/@self - Guest receives information about himself", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const { data } = await guestApi.profiles.getSelfProfile();
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(memberData.response!.firstName);
    expect(data.response!.lastName).toBe(memberData.response!.lastName);
    expect(data.response!.displayName).toBe(memberData.response!.displayName);
    expect(data.response!.isVisitor).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(data.response!.hasPersonalFolder).toBe(false);
  });

  test("GET /people/email?email= - Owner receives information about himself via email.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    const { data } = await ownerApi.profiles.getProfileByEmail({ email: ownerEmail });
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(ownerData.response!.firstName);
    expect(data.response!.lastName).toBe(ownerData.response!.lastName);
    expect(data.response!.displayName).toBe(ownerData.response!.displayName);
    expect(data.response!.email).toBe(ownerData.response!.email);
    expect(data.response!.isAdmin).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people/email?email= - Owner receives information about another user via email.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: docSpaceData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceEmail = docSpaceData.response!.email!;

    const { data } = await ownerApi.profiles.getProfileByEmail({ email: docSpaceEmail });
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(docSpaceData.response!.firstName);
    expect(data.response!.lastName).toBe(docSpaceData.response!.lastName);
    expect(data.response!.displayName).toBe(docSpaceData.response!.displayName);
    expect(data.response!.email).toBe(docSpaceData.response!.email);
    expect(data.response!.isAdmin).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people/email?email= - DocSpace admin receives information about himself via email.", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data: docSpaceAdminData } =
      await adminApi.profiles.getSelfProfile();
    const docSpaceAdminEmail = docSpaceAdminData.response!.email!;

    const { data } =
      await adminApi.profiles.getProfileByEmail({ email: docSpaceAdminEmail });
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(
      docSpaceAdminData.response!.firstName,
    );
    expect(data.response!.lastName).toBe(docSpaceAdminData.response!.lastName);
    expect(data.response!.displayName).toBe(
      docSpaceAdminData.response!.displayName,
    );
    expect(data.response!.email).toBe(docSpaceAdminData.response!.email);
    expect(data.response!.isAdmin).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people/email?email= - DocSpace admin receives information about another user via email.", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminData.response!.email!;

    const { data } = await adminApi.profiles.getProfileByEmail({ email: roomAdminEmail });
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(roomAdminData.response!.firstName);
    expect(data.response!.lastName).toBe(roomAdminData.response!.lastName);
    expect(data.response!.displayName).toBe(
      roomAdminData.response!.displayName,
    );
    expect(data.response!.email).toBe(roomAdminData.response!.email);
    expect(data.response!.isRoomAdmin).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people/email?email= - Room admin receives information about another user via email.", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userEmail = userData.response!.email!;

    const { data } = await roomAdminApi.profiles.getProfileByEmail({ email: userEmail });
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(userData.response!.firstName);
    expect(data.response!.lastName).toBe(userData.response!.lastName);
    expect(data.response!.displayName).toBe(userData.response!.displayName);
    expect(data.response!.email).toBe(userData.response!.email);
    expect(data.response!.isCollaborator).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people/email?email= - User receives information about himself via email.", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data: selfData } = await userApi.profiles.getSelfProfile();
    const userEmail = selfData.response!.email!;

    const { data } = await userApi.profiles.getProfileByEmail({ email: userEmail });
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(selfData.response!.firstName);
    expect(data.response!.lastName).toBe(selfData.response!.lastName);
    expect(data.response!.displayName).toBe(selfData.response!.displayName);
    expect(data.response!.email).toBe(selfData.response!.email);
    expect(data.response!.isCollaborator).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("GET /people/email?email= - Guest receives information about himself via email.", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data: selfData } = await guestApi.profiles.getSelfProfile();
    const userEmail = selfData.response!.email!;

    const { data } = await guestApi.profiles.getProfileByEmail({ email: userEmail });
    expect(data.statusCode).toBe(200);
    expect(data.response!.firstName).toBe(selfData.response!.firstName);
    expect(data.response!.lastName).toBe(selfData.response!.lastName);
    expect(data.response!.displayName).toBe(selfData.response!.displayName);
    expect(data.response!.email).toBe(selfData.response!.email);
    expect(data.response!.isVisitor).toBe(true);
    expect(data.response!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  test("PUT /people/delete - Owner removes deactivated users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const usersRequestData = {
      userIds: [docSpaceAdminId, roomAdminId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({ status:
      EmployeeStatus.Terminated,
      updateMembersRequestDto: usersRequestData,
    });
    const { data } = await ownerApi.profiles.removeUsers({ updateMembersRequestDto: usersRequestData });
    expect(data.statusCode).toBe(200);
    expect(data.response![0].id).toBe(docSpaceAdminId);
    expect(data.response![1].id).toBe(roomAdminId);
    expect(data.response![0].status).toBe(2);
    expect(data.response![1].status).toBe(2);
    expect(data.response![0].isAdmin).toBe(true);
    expect(data.response![1].isRoomAdmin).toBe(true);
  });

  test("PUT /people/delete - DocSpace admin removes deactivated users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const usersRequestData = {
      userIds: [roomAdminId, userId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({ status:
      EmployeeStatus.Terminated,
      updateMembersRequestDto: usersRequestData,
    });
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data } = await adminApi.profiles.removeUsers({ updateMembersRequestDto: usersRequestData });
    expect(data.statusCode).toBe(200);
    expect(data.response![0].id).toBe(roomAdminId);
    expect(data.response![1].id).toBe(userId);
    expect(data.response![0].status).toBe(2);
    expect(data.response![1].status).toBe(2);
    expect(data.response![0].isRoomAdmin).toBe(true);
    expect(data.response![1].isCollaborator).toBe(true);
  });

  test("PUT /people/:userId/culture - Owner update a culture code of himself", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

    const { data } = await ownerApi.profiles.updateMemberCulture({ userid: ownerId, culture: {
      cultureName: "es",
    } });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(ownerId);
    expect(data.response!.email).toBe(ownerData.response!.email);
    expect(data.response!.firstName).toBe(ownerData.response!.firstName);
    expect(data.response!.lastName).toBe(ownerData.response!.lastName);
    expect(data.response!.cultureName).toBe("es");
  });

  test("PUT /people/:userId/culture - DocSpace admin update a culture code of himself", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData, api: adminApi } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data } = await adminApi.profiles.updateMemberCulture({ userid: docSpaceAdminId, culture: {
        cultureName: "es",
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(docSpaceAdminId);
    expect(data.response!.email).toBe(docSpaceAdminData.response!.email);
    expect(data.response!.firstName).toBe(
      docSpaceAdminData.response!.firstName,
    );
    expect(data.response!.lastName).toBe(docSpaceAdminData.response!.lastName);
    expect(data.response!.cultureName).toBe("es");
  });

  test("PUT /people/:userId/culture - Room admin update a culture code of himself", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data } = await roomAdminApi.profiles.updateMemberCulture({ userid: roomAdminId, culture: {
        cultureName: "es",
      },
    });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(roomAdminId);
    expect(data.response!.email).toBe(roomAdminData.response!.email);
    expect(data.response!.firstName).toBe(roomAdminData.response!.firstName);
    expect(data.response!.lastName).toBe(roomAdminData.response!.lastName);
    expect(data.response!.cultureName).toBe("es");
  });

  test("PUT /people/:userId/culture - User update a culture code of himself", async ({
    apiSdk,
  }) => {
    const { data: userData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    const { data } = await userApi.profiles.updateMemberCulture({ userid: userId, culture: {
      cultureName: "es",
    } });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.email).toBe(userData.response!.email);
    expect(data.response!.firstName).toBe(userData.response!.firstName);
    expect(data.response!.lastName).toBe(userData.response!.lastName);
    expect(data.response!.cultureName).toBe("es");
  });

  test("PUT /people/:userId/culture - Guest update a culture code of himself", async ({
    apiSdk,
  }) => {
    const { data: guestData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const userId = guestData.response!.id!;

    const { data } = await guestApi.profiles.updateMemberCulture({ userid: userId, culture: {
      cultureName: "es",
    } });
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.email).toBe(guestData.response!.email);
    expect(data.response!.firstName).toBe(guestData.response!.firstName);
    expect(data.response!.lastName).toBe(guestData.response!.lastName);
    expect(data.response!.cultureName).toBe("es");
  });
});

/* TODO: - Need email integration to this methods to be able to test them properly
DELETE /people/@self
GET /people/tokendiagnostics
PUT /people/{userid}/email
*/
