// Tests that check user access rights.

import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

test.describe("PUT /people/status/:status - access control", () => {
  test("PUT /people/status/:status - Owner deactivates the user without authorization", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const requestData = {
      userIds: [userId],
      resendAll: false,
    };

    const { status } = await anonApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(status).toBe(401);
  });

  test("BUG 79900: PUT /people/status/:status - DocSpace admin deactivates the DocSpace admin", async ({
    apiSdk,
  }) => {
    const { data: docspaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docspaceAdminId = docspaceAdminData.response!.id!;

    const requestData = {
      userIds: [docspaceAdminId],
      resendAll: false,
    };

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data } = await adminApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("BUG 79900: PUT /people/status/:status - DocSpace admin deactivates Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const requestData = {
      userIds: [ownerId],
      resendAll: false,
    };

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data } = await adminApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("PUT /people/status/:status - Room admin deactivates the different type of users", async ({
    apiSdk,
  }) => {
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [guestId, userId, docSpaceAdminId],
      resendAll: false,
    };

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - Room admin activates the different type of users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [guestId, userId, docSpaceAdminId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Active,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - Room admin deactivates Room Admin", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const requestData = {
      userIds: [roomAdminId],
      resendAll: false,
    };

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - Room admin deactivates DocSpace Admin", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [docSpaceAdminId],
      resendAll: false,
    };

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - Room admin deactivates Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const requestData = {
      userIds: [ownerId],
      resendAll: false,
    };

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("PUT /people/status/:status - User deactivates Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const requestData = {
      userIds: [ownerId],
      resendAll: false,
    };

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("PUT /people/status/:status - User deactivates DocSpace Admin", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [docSpaceAdminId],
      resendAll: false,
    };

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - User deactivates Room admin", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const requestData = {
      userIds: [roomAdminId],
      resendAll: false,
    };

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - User deactivates User", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const requestData = {
      userIds: [userId],
      resendAll: false,
    };

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - Guest deactivates Owner", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const requestData = {
      userIds: [ownerId],
      resendAll: false,
    };

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message as string).toContain("Access denied");
  });

  test("PUT /people/status/:status - Guest deactivates DocSpace Admin", async ({
    apiSdk,
  }) => {
    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [docSpaceAdminId],
      resendAll: false,
    };

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - Guest deactivates Room Admin", async ({
    apiSdk,
  }) => {
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const requestData = {
      userIds: [roomAdminId],
      resendAll: false,
    };

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - Guest deactivates user", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const requestData = {
      userIds: [userId],
      resendAll: false,
    };

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - User activates the different type of users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: guestData } = await apiSdk.addMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [guestId, roomAdminId, docSpaceAdminId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Active,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /people/status/:status - access control", () => {
  test("GET /people/status/:status - User returns a list of profiles filtered by the active user status", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "DocSpaceAdmin");
    await apiSdk.addMember("owner", "RoomAdmin");
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    await apiSdk.addMember("owner", "Guest");

    const { data } = await userApi.userStatus.getByStatus({
      status: EmployeeStatus.Active,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /people/status/:status - User returns a list of profiles filtered by the disabled user status", async ({
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

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [docSpaceAdminId, roomAdminId, userId, guestId],
        resendAll: false,
      },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.userStatus.getByStatus({
      status: EmployeeStatus.Terminated,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/status/:status - Guest activates the different type of users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const requestData = {
      userIds: [userId, roomAdminId, docSpaceAdminId],
      resendAll: false,
    };

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: requestData,
    });
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Active,
      updateMembersRequestDto: requestData,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /people/status/:status - Guest returns a list of profiles filtered by the disabled user status", async ({
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

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: {
        userIds: [docSpaceAdminId, roomAdminId, userId, guestId],
        resendAll: false,
      },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );
    const { data } = await guestApi.userStatus.getByStatus({
      status: EmployeeStatus.Terminated,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});
