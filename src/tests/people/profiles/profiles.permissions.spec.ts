// Tests that check user access rights.

import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { faker } from "@faker-js/faker";
import { EmployeeType, EmployeeStatus } from "@onlyoffice/docspace-api-sdk";
import config from "@/config";

type UsersListItem = {
  email: string;
  displayName?: string;
  id: string;
};

test.describe("API profiling tests for access rights", () => {
  test("POST /people - Owner create User for long first and last name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const userData = {
      password: faker.internet.password({ length: 12 }),
      email: faker.internet.email(),
      firstName: apiSdk.faker.generateString(260),
      lastName: apiSdk.faker.generateString(260),
      type: "User",
    };
    const { data, status } = await ownerApi.profiles.addMember(userData as any); // TODO(sdk): SDK method input type too narrow — some fields missing from DTO
    expect(status).toBe(400);
    const errors1 = (data as any).response.errors as Record<string, string[]>; // TODO(sdk): RFC 7807 validation error shape not typed in SDK
    expect(errors1.FirstName).toContain(
      "The field FirstName must be a string with a maximum length of 255.",
    );
    expect(errors1.LastName).toContain(
      "The field LastName must be a string with a maximum length of 255.",
    );
  });

  test("POST /people - Owner create User for long email", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = apiSdk.faker.generateEmailWithLength(260);
    const userData = {
      password: faker.internet.password({ length: 12 }),
      email,
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      type: "User",
    };
    const { data, status } = await ownerApi.profiles.addMember(userData as any); // TODO(sdk): SDK method input type too narrow — some fields missing from DTO
    expect(data.statusCode).toBe(200);
    expect(status).toBe(400);
    expect(
      ((data as any).response.errors as Record<string, string[]>).Email,
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field Email must be a string with a maximum length of 255.",
    );
  });

  test("POST /people - DocSpace admin creates DocSpace admin", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.profiles.addMember({
      ...apiSdk.faker.generateUser(),
      type: EmployeeType.DocSpaceAdmin,
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people - Room admin creates Room admin", async ({ apiSdk }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.profiles.addMember(
      apiSdk.faker.generateUser() as any,
    );
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people - User creates User", async ({ apiSdk }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.profiles.addMember(
      apiSdk.faker.generateUser() as any,
    );
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people - Adding a user without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();
    const fakeUser = apiSdk.faker.generateUser();
    const { status } = await anonApi.profiles.addMember({
      ...fakeUser,
      type: "User",
    } as any);
    expect(status).toBe(401);
  });

  test("GET /people - User returns all users list", async ({ apiSdk }) => {
    await apiSdk.addMember("owner", "DocSpaceAdmin");
    await apiSdk.addMember("owner", "RoomAdmin");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.profiles.getAllProfiles();
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("GET /people - Guest returns all users list", async ({ apiSdk }) => {
    await apiSdk.addMember("owner", "DocSpaceAdmin");
    await apiSdk.addMember("owner", "RoomAdmin");
    await apiSdk.addMember("owner", "User");
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.profiles.getAllProfiles();
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("GET /people - Return all users list without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.profiles.getAllProfiles();
    expect(status).toBe(401);
  });

  test("POST /people/invite - Owner invites guest", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = faker.internet.email();

    const { data } = await ownerApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.Guest, email }],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/invite - DocSpace admin invites guest", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const email = faker.internet.email();

    const { data } = await adminApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.Guest, email }],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/invite - Room admin invites guest", async ({ apiSdk }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const email = faker.internet.email();

    const { data } = await roomAdminApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.Guest, email }],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/invite - User invites guest", async ({ apiSdk }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const email = faker.internet.email();

    const { data } = await userApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.Guest, email }],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/invite - Guest invites guest", async ({ apiSdk }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const email = faker.internet.email();

    const { data } = await guestApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.Guest, email }],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/invite - DocSpace admin invites docspace admin", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const email = faker.internet.email();

    const { data } = await adminApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.DocSpaceAdmin, email }],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/invite - Room admin invites room admin", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const email = faker.internet.email();

    const { data } = await roomAdminApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.RoomAdmin, email }],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/invite - User invites user", async ({ apiSdk }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const email = faker.internet.email();

    const { data } = await userApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.User, email }],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/invite - Invite user for long email", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const localPart = faker.string.alpha({ length: 260, casing: "lower" });
    const domain = faker.internet.domainName();
    const email = `${localPart}@${domain}`;
    const { data } = await ownerApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.User, email }],
    });
    expect((data as any).response.status).toBe(400);
    expect(
      ((data as any).response.errors as Record<string, string[]>)?.[
        "Invitations[0].Email"
      ]?.[0],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field Email must be a string or array type with a maximum length of '255'.",
    );
  });

  test("POST /people/invite - Inviting a user without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();
    const email = faker.internet.email();
    const { status } = await anonApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.User, email }],
    });
    expect(status).toBe(401);
  });

  test("PUT /people/invite - Guest resends activation emails ", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = faker.internet.email();
    const { data: inviteData } = await ownerApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.RoomAdmin, email }],
    });
    const invitedUser = inviteData.response!.find(
      (u) => u.displayName === email,
    )!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.profiles.resendUserInvites({
      userIds: [invitedUser.id as string],
      resendAll: false,
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  // 79545 - Fix
  test("PUT /people/invite - User resend activation emails ", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const email = faker.internet.email();

    const { data: inviteData } = await ownerApi.profiles.inviteUsers({
      invitations: [{ type: EmployeeType.User, email }],
    });
    const invitedUser = inviteData.response!.find(
      (u) => u.displayName === email,
    )!;
    const userData = {
      userIds: [invitedUser.id as string],
      resendAll: false,
    };

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.profiles.resendUserInvites(userData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/invite - Resending activation email by unauthorized user", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();
    const { status } = await anonApi.profiles.resendUserInvites({
      userIds: [],
      resendAll: false,
    });
    expect(status).toBe(401);
  });

  test("DELETE /people/:userIds - Owner deletes a non-deactivated guest", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "Guest");
    const userId = userData.response!.id!;
    const { data } = await ownerApi.profiles.deleteMember(userId);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("The user is not suspended"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  // 79560 - Fixed
  test("DELETE /people/:userIds - Owner deletes a non-deactivated user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data } = await ownerApi.profiles.removeUsers({
      userIds: [userId],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Users are not suspended"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  // 79560 - Fixed
  test("DELETE /people/:userIds - DocSpace admin deletes a non-deactivated user", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data } = await adminApi.profiles.deleteMember(userId);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("The user is not suspended"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("DELETE /people/:userIds - Room admin deletes a non-deactivated user", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.profiles.removeUsers({
      userIds: [userId],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("DELETE /people/:userIds - User deletes a non-deactivated user", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.profiles.removeUsers({
      userIds: [userId],
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("DELETE /people/:userIds - DocSpace admin deletes a deactivated docspace admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    // Create first DocSpace admin that will be deleted
    const { data: userToDeleteData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const userIdToDelete = userToDeleteData.response!.id!;

    // Disable the first DocSpace admin
    const userDataChangeStatus = {
      userIds: [userIdToDelete],
      resendAll: false,
    };
    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );

    // Create second DocSpace admin that will perform the deletion
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.profiles.deleteMember(userIdToDelete);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("DELETE /people/:userIds - Room admin deletes a deactivated room admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    // Create first Room admin that will be deleted
    const { data: userToDeleteData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const userIdToDelete = userToDeleteData.response!.id!;

    // Disable the first Room admin
    const userDataChangeStatus = {
      userIds: [userIdToDelete],
      resendAll: false,
    };
    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );

    // Create second Room admin that will perform the deletion
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    // Delete the disabled Room admin
    const userDataDeleteUser = {
      userIds: [userIdToDelete],
    };

    const { data } =
      await roomAdminApi.profiles.removeUsers(userDataDeleteUser);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("DELETE /people/:userIds - User deletes a deactivated user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    // Create first User that will be deleted
    const { data: userToDeleteData } = await apiSdk.addMember("owner", "User");
    const userIdToDelete = userToDeleteData.response!.id!;

    // Disable the first User
    const userDataChangeStatus = {
      userIds: [userIdToDelete],
      resendAll: false,
    };
    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );

    // Create second User that will perform the deletion
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    // Delete the disabled User
    const userDataDeleteUser = {
      userIds: [userIdToDelete],
    };

    const { data } = await userApi.profiles.removeUsers(userDataDeleteUser);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("DELETE /people/:userIds - Room admin deletes a deactivated user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    // Create first user that will be deleted
    const { data: userToDeleteData } = await apiSdk.addMember("owner", "User");
    const userIdToDelete = userToDeleteData.response!.id!;

    // Disable the first user
    const userDataChangeStatus = {
      userIds: [userIdToDelete],
      resendAll: false,
    };
    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );

    // Create second Room admin that will perform the deletion
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    // Delete the disabled user
    const userDataDeleteUser = {
      userIds: [userIdToDelete],
    };

    const { data } =
      await roomAdminApi.profiles.removeUsers(userDataDeleteUser);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("DELETE /people/:userIds - Deleting a non-existent user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;

    const userDataChangeStatus = {
      userIds: [userId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );
    await ownerApi.profiles.deleteMember(userId);
    const { data } = await ownerApi.profiles.deleteMember(userId);
    expect(data.statusCode).toBe(404);
    expect((data as any).error.message).toContain(
      "The user could not be found",
    ); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("DELETE /people/:userIds - Deleting a user without authorization", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const anonApi = apiSdk.forAnonymous();
    // Create first user that will be deleted
    const { data: userToDeleteData } = await apiSdk.addMember("owner", "User");
    const userIdToDelete = userToDeleteData.response!.id!;

    // Disable the first user
    const userDataChangeStatus = {
      userIds: [userIdToDelete],
      resendAll: false,
    };
    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );

    // Delete the disabled user
    const userDataDeleteUser = {
      userIds: [userIdToDelete],
    };

    const { status } = await anonApi.profiles.removeUsers(userDataDeleteUser);
    expect(status).toBe(401);
  });

  test("GET /people/:userId - Returns detailed information about a non-existent user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;

    const userDataChangeStatus = {
      userIds: [userId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );

    const userDataDeleteUser = {
      userIds: [userId],
    };

    await ownerApi.profiles.removeUsers(userDataDeleteUser);

    const { data } = await ownerApi.profiles.getProfileByUserId(userId);
    expect(data.statusCode).toBe(404);
    expect((data as any).error.message).toContain(
      // TODO(sdk): error field not typed in SDK response wrappers
      "The user could not be found",
    );
  });

  test("GET /people/:userId - Returns detailed information of a user without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;

    const { status } = await anonApi.profiles.getProfileByUserId(userId);
    expect(status).toBe(401);
  });

  test("GET /people/:userIds - User returns detailed information of a user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
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
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.profiles.getProfileByUserId(userId);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("GET /people/:userIds - Guest returns detailed information of a user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
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
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.profiles.getProfileByUserId(userId);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/:userId - Updating owner profile data without authorization", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const anonApi = apiSdk.forAnonymous();
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
    const listBody = listData as { response: UsersListItem[] };
    const userId = listBody.response[0].id;
    const userData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };

    const { status } = await anonApi.profiles.updateMember(userId, userData);
    expect(status).toBe(401);
  });

  test("PUT /people/:userId - Updating profile data non-existent user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;

    const userDataChangeStatus = {
      userIds: [userId],
      resendAll: false,
    };
    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );

    const userDataDeleteUser = {
      userIds: [userId],
    };
    await ownerApi.profiles.removeUsers(userDataDeleteUser);

    const updateData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
    const { data } = await ownerApi.profiles.updateMember(userId, updateData);
    expect(data.statusCode).toBe(404);
    expect((data as any).error.message).toContain(
      // TODO(sdk): error field not typed in SDK response wrappers
      "The user could not be found",
    );
  });

  test("PUT /people/:userId - DocSpace admin updating profile data owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
    const listBody = listData as { response: UsersListItem[] };
    const userId = listBody.response[0].id;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const userData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
    const { data } = await adminApi.profiles.updateMember(userId, userData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/:userId - Room admin updating profile data owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
    const listBody = listData as { response: UsersListItem[] };
    const userId = listBody.response[0].id;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const userData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
    const { data } = await roomAdminApi.profiles.updateMember(userId, userData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/:userId - User updating profile data owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
    const listBody = listData as { response: UsersListItem[] };
    const userId = listBody.response[0].id;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
    const { data } = await userApi.profiles.updateMember(userId, userData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/:userId - Guest updating profile data owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
    const listBody = listData as { response: UsersListItem[] };
    const userId = listBody.response[0].id;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const userData = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
    };
    const { data } = await guestApi.profiles.updateMember(userId, userData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/:userId - Updating owner profile data with incorrect name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: listData } = await ownerApi.profiles.getAllProfiles();
    const listBody = listData as { response: UsersListItem[] };
    const userId = listBody.response[0].id;
    const incorrectName = faker.number.int({ min: 1, max: 10 });
    const userData = {
      firstName: incorrectName.toString(),
      lastName: faker.person.lastName(),
    };

    const { data } = await ownerApi.profiles.updateMember(userId, userData);
    expect(data.statusCode).toBe(400);
    expect((data as any).error.message).toContain(
      // TODO(sdk): error field not typed in SDK response wrappers
      "Incorrect firstname or lastname",
    );
  });

  test("PUT /people/:userId - Updating user profile data with incorrect data", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = memberData.response!.id!;

    const userData = {
      firstName: apiSdk.faker.generateString(260),
      lastName: apiSdk.faker.generateString(260),
    };

    const { data } = await userApi.profiles.updateMember(userId, userData);
    expect((data as any).response.status).toBe(400);
    expect(
      ((data as any).response.errors as Record<string, string[]>)[
        "UpdateMember.FirstName"
      ],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field FirstName must be a string with a maximum length of 255.",
    );
    expect(
      ((data as any).response.errors as Record<string, string[]>)[
        "UpdateMember.LastName"
      ],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field LastName must be a string with a maximum length of 255.",
    );
  });

  test("PUT /people/:userId - Updating guest profile data with incorrect data", async ({
    apiSdk,
  }) => {
    const { data: memberData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const userId = memberData.response!.id!;

    const userData = {
      firstName: apiSdk.faker.generateString(260),
      lastName: apiSdk.faker.generateString(260),
    };

    const { data } = await guestApi.profiles.updateMember(userId, userData);
    expect((data as any).response.status).toBe(400);
    expect(
      ((data as any).response.errors as Record<string, string[]>)[
        "UpdateMember.FirstName"
      ],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field FirstName must be a string with a maximum length of 255.",
    );
    expect(
      ((data as any).response.errors as Record<string, string[]>)[
        "UpdateMember.LastName"
      ],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field LastName must be a string with a maximum length of 255.",
    );
  });

  test("GET /people/email?email= - Receives information about another user via email without authorization.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const anonApi = apiSdk.forAnonymous();
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerEmail = ownerData.response!.email!;

    const { status } = await anonApi.profiles.getProfileByEmail(ownerEmail);
    expect(status).toBe(401);
  });

  test("GET /people/email?email= - Receives information about another user via email with a non-existent user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;
    const docSpaceEmail = userData.response!.email!;

    const userDataChangeStatus = {
      userIds: [userId],
      resendAll: false,
    };

    const userDataDeleteUser = {
      userIds: [userId],
    };

    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      userDataChangeStatus,
    );
    await ownerApi.profiles.removeUsers(userDataDeleteUser);
    const { data } = await ownerApi.profiles.getProfileByEmail(docSpaceEmail);
    expect(data.statusCode).toBe(404);
    expect((data as any).error.message).toContain(
      "The user could not be found",
    ); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("GET /people/email?email= - User receives information about another user via email.", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminData.response!.email!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.profiles.getProfileByEmail(roomAdminEmail);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("GET /people/email?email= - Guest receives information about another user via email.", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminEmail = roomAdminData.response!.email!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.profiles.getProfileByEmail(roomAdminEmail);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Sent instructions on changing an email address to a non-existent user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const userId = faker.string.uuid();
    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      userId: userId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(404);
    expect((data as any).error.message).toContain(
      "The user could not be found",
    ); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Sent instructions on how to change your email address with an incorrect email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const incorrectEmail = apiSdk.faker.generateString(20);

    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      userId: userId,
      email: incorrectEmail,
    });
    expect((data as any).response.status).toBe(400);
    expect((data as any).response.title).toContain(
      "One or more validation errors occurred.",
    );
    expect(
      ((data as any).response.errors as Record<string, string[]>).Email[0],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The Email field is not a valid e-mail address.",
    );
  });

  test("POST /people/email - DocSpace admin sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.email.sendEmailChangeInstructions({
      userId: docSpaceAdminId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - DocSpace admin sent Owner user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data } = await adminApi.email.sendEmailChangeInstructions({
      userId: ownerId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Room admin sent Owner user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      userId: ownerId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Room admin sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      userId: docSpaceAdminId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Room admin sent Room admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      userId: roomAdminId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Room admin sent User instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data } = await roomAdminApi.email.sendEmailChangeInstructions({
      userId: userId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent Owner user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      userId: ownerId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Guest sent Owner user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      userId: ownerId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      userId: docSpaceAdminId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Guest sent DocSpace admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      userId: docSpaceAdminId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent Room admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      userId: roomAdminId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Guest sent Room admin user instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      userId: roomAdminId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent another User instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      userId: userId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - User sent Guest instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "Guest");
    const userId = userData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.email.sendEmailChangeInstructions({
      userId: userId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Guest sent User instructions on how to change his email address", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.email.sendEmailChangeInstructions({
      userId: userId,
      email: faker.internet.email(),
    });
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("POST /people/email - Sent instructions on how to change email address without authorization", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const anonApi = apiSdk.forAnonymous();
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

    const { status } = await anonApi.email.sendEmailChangeInstructions({
      userId: ownerId,
      email: faker.internet.email(),
    });
    expect(status).toBe(401);
  });

  test("POST /people/email - Sending instructions on how to change a very long email address.", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;
    const veryLongEmail = apiSdk.faker.generateEmailWithLength(260);

    const { data } = await ownerApi.email.sendEmailChangeInstructions({
      userId: docSpaceAdminId,
      email: veryLongEmail,
    });
    expect((data as any).response.status).toBe(400);
    expect((data as any).response.title).toContain(
      "One or more validation errors occurred.",
    );
    expect(
      ((data as any).response.errors as Record<string, string[]>).Email[0],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field Email must be a string with a maximum length of 255.",
    );
  });

  // 79876 - FIX
  test("PUT /people/delete - Owner delete non-deactivated users", async ({
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
    const { data } = await ownerApi.profiles.removeUsers(usersRequestData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Users are not suspended"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/delete - Room admin removes deactivated users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: user1Data } = await apiSdk.addMember("owner", "User");
    const user1Id = user1Data.response!.id!;

    const { data: user2Data } = await apiSdk.addMember("owner", "User");
    const user2Id = user2Data.response!.id!;

    const usersRequestData = {
      userIds: [user1Id, user2Id],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      usersRequestData,
    );
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.profiles.removeUsers(usersRequestData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/delete - User removes deactivated users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: user1Data } = await apiSdk.addMember("owner", "User");
    const user1Id = user1Data.response!.id!;

    const { data: user2Data } = await apiSdk.addMember("owner", "User");
    const user2Id = user2Data.response!.id!;

    const usersRequestData = {
      userIds: [user1Id, user2Id],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      usersRequestData,
    );
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.profiles.removeUsers(usersRequestData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/delete - Guest removes deactivated users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: user1Data } = await apiSdk.addMember("owner", "User");
    const user1Id = user1Data.response!.id!;

    const { data: user2Data } = await apiSdk.addMember("owner", "User");
    const user2Id = user2Data.response!.id!;

    const usersRequestData = {
      userIds: [user1Id, user2Id],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus(
      EmployeeStatus.Terminated,
      usersRequestData,
    );
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.profiles.removeUsers(usersRequestData);
    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toContain("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/:userId/culture - Update a culture code of himself without authorization", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const anonApi = apiSdk.forAnonymous();
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

    const { status } = await anonApi.profiles.updateMemberCulture(ownerId, {
      cultureName: "es",
    });
    expect(status).toBe(401);
  });

  // 65478 - FIX
  test("PUT /people/:userId/culture - Owner update a culture code another's users", async ({
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

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: docSpaceAdminResponse } =
      await ownerApi.profiles.updateMemberCulture(docSpaceAdminId, {
        cultureName: "es",
      });
    expect(docSpaceAdminResponse.statusCode).toBe(403);
    expect((docSpaceAdminResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: roomAdminResponse } =
      await ownerApi.profiles.updateMemberCulture(roomAdminId, {
        cultureName: "es",
      });
    expect(roomAdminResponse.statusCode).toBe(403);
    expect((roomAdminResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: userResponse } = await ownerApi.profiles.updateMemberCulture(
      userId,
      {
        cultureName: "es",
      },
    );
    expect(userResponse.statusCode).toBe(403);
    expect((userResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: guestResponse } = await ownerApi.profiles.updateMemberCulture(
      guestId,
      {
        cultureName: "es",
      },
    );
    expect(guestResponse.statusCode).toBe(403);
    expect((guestResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  // 65478 - FIX
  test("PUT /people/:userId/culture - DocSpace admin update a culture code another's users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: ownerResponse } = await adminApi.profiles.updateMemberCulture(
      ownerId,
      {
        cultureName: "es",
      },
    );
    expect(ownerResponse.statusCode).toBe(403);
    expect((ownerResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: roomAdminResponse } =
      await adminApi.profiles.updateMemberCulture(roomAdminId, {
        cultureName: "es",
      });
    expect(roomAdminResponse.statusCode).toBe(403);
    expect((roomAdminResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: userResponse } = await adminApi.profiles.updateMemberCulture(
      userId,
      {
        cultureName: "es",
      },
    );
    expect(userResponse.statusCode).toBe(403);
    expect((userResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: guestResponse } = await ownerApi.profiles.updateMemberCulture(
      guestId,
      {
        cultureName: "es",
      },
    );
    expect(guestResponse.statusCode).toBe(403);
    expect((guestResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  // 65478 - FIX
  test("PUT /people/:userId/culture - Room admin update a culture code another's users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data: ownerResponse } =
      await roomAdminApi.profiles.updateMemberCulture(ownerId, {
        cultureName: "es",
      });
    expect(ownerResponse.statusCode).toBe(403);
    expect((ownerResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: docSpaceAdminResponse } =
      await roomAdminApi.profiles.updateMemberCulture(docSpaceAdminId, {
        cultureName: "es",
      });
    expect(docSpaceAdminResponse.statusCode).toBe(403);
    expect((docSpaceAdminResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: userResponse } =
      await roomAdminApi.profiles.updateMemberCulture(userId, {
        cultureName: "es",
      });
    expect(userResponse.statusCode).toBe(403);
    expect((userResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: guestResponse } = await ownerApi.profiles.updateMemberCulture(
      guestId,
      {
        cultureName: "es",
      },
    );
    expect(guestResponse.statusCode).toBe(403);
    expect((guestResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  // 65478 - FIX
  test("PUT /people/:userId/culture - User update a culture code another's users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

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

    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data: ownerResponse } = await userApi.profiles.updateMemberCulture(
      ownerId,
      {
        cultureName: "es",
      },
    );
    expect(ownerResponse.statusCode).toBe(403);
    expect((ownerResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: docSpaceAdminResponse } =
      await userApi.profiles.updateMemberCulture(docSpaceAdminId, {
        cultureName: "es",
      });
    expect(docSpaceAdminResponse.statusCode).toBe(403);
    expect((docSpaceAdminResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: roomAdminResponse } =
      await userApi.profiles.updateMemberCulture(roomAdminId, {
        cultureName: "es",
      });
    expect(roomAdminResponse.statusCode).toBe(403);
    expect((roomAdminResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: guestResponse } = await ownerApi.profiles.updateMemberCulture(
      guestId,
      {
        cultureName: "es",
      },
    );
    expect(guestResponse.statusCode).toBe(403);
    expect((guestResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/:userId/culture - Guest update a culture code another's users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;

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

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data: ownerResponse } = await guestApi.profiles.updateMemberCulture(
      ownerId,
      {
        cultureName: "es",
      },
    );
    expect(ownerResponse.statusCode).toBe(403);
    expect((ownerResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: docSpaceAdminResponse } =
      await guestApi.profiles.updateMemberCulture(docSpaceAdminId, {
        cultureName: "es",
      });
    expect(docSpaceAdminResponse.statusCode).toBe(403);
    expect((docSpaceAdminResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: roomAdminResponse } =
      await guestApi.profiles.updateMemberCulture(roomAdminId, {
        cultureName: "es",
      });
    expect(roomAdminResponse.statusCode).toBe(403);
    expect((roomAdminResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers

    const { data: userResponse } = await guestApi.profiles.updateMemberCulture(
      userId,
      {
        cultureName: "es",
      },
    );
    expect(userResponse.statusCode).toBe(403);
    expect((userResponse as any).error.message).toBe("Access denied"); // TODO(sdk): error field not typed in SDK response wrappers
  });

  test("PUT /people/:userId/culture - Owner update a culture code of non-existent user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const userId = faker.string.uuid();
    const { data } = await ownerApi.profiles.updateMemberCulture(userId, {
      cultureName: "es",
    });
    expect(data.statusCode).toBe(404);
    expect((data as any).error.message).toContain(
      "The user could not be found",
    ); // TODO(sdk): error field not typed in SDK response wrappers
  });

  // 79918 - FIX
  test("PUT /people/:userId/culture - Update culture code with long string", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerData.response!.id!;
    const longString = apiSdk.faker.generateString(260);

    const { data } = await ownerApi.profiles.updateMemberCulture(ownerId, {
      cultureName: longString,
    });
    expect((data as any).response.status).toBe(400);
    expect(
      ((data as any).response.errors as Record<string, string[]>)[
        "Culture.CultureName"
      ][0],
    ).toContain(
      // TODO(sdk): RFC 7807 validation error shape not typed in SDK
      "The field CultureName must be a string with a maximum length of 85.",
    );
  });
});
