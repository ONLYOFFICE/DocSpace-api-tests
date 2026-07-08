import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

test.describe("PUT /api/2.0/files/thirdparty - Change third-party settings access - Permissions", () => {
  test("PUT /api/2.0/files/thirdparty - Unauthenticated user cannot change third-party access", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/thirdparty - DocSpaceAdmin can enable third-party access", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/thirdparty - DocSpaceAdmin can disable third-party access", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: false },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(false);
  });

  test("PUT /api/2.0/files/thirdparty - RoomAdmin cannot change third-party access", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You don't have enough permission to perform the operation",
    );
  });

  test("PUT /api/2.0/files/thirdparty - User cannot change third-party access", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You don't have enough permission to perform the operation",
    );
  });

  test("PUT /api/2.0/files/thirdparty - Guest cannot change third-party access", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You don't have enough permission to perform the operation",
    );
  });

  // BUG 82302: PUT /api/2.0/files/thirdparty - Deleted user token remains valid, returns 200 instead of 401
  test.fail(
    "BUG 82302: PUT /api/2.0/files/thirdparty - Deleted DocSpaceAdmin cannot change third-party access",
    async ({ apiSdk }) => {
      const { api: adminApi, data: adminData } =
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      const adminId = adminData.response!.id!;

      await apiSdk.forRole("owner").profiles.deleteMember({ userid: adminId });

      const { status } = await adminApi.filesSettings.changeAccessToThirdparty({
        settingsRequestDto: { set: true },
      });

      expect(status).toBe(401);
    },
  );

  test("PUT /api/2.0/files/thirdparty - Terminated DocSpaceAdmin cannot change third-party access", async ({
    apiSdk,
  }) => {
    const { api: adminApi, data: adminData } =
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
    const adminId = adminData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [adminId], resendAll: false },
    });

    const { status } = await adminApi.filesSettings.changeAccessToThirdparty({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/forcesave - Change the forcesaving ability - Permissions", () => {
  test("PUT /api/2.0/files/forcesave - Unauthenticated user cannot change forcesave setting", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().filesSettings.forcesave();

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/forcesave - Owner can change forcesave setting", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.forcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/forcesave - DocSpaceAdmin can change own forcesave setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.forcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/forcesave - RoomAdmin can change own forcesave setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.forcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/forcesave - User can change own forcesave setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.forcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/forcesave - Guest can change own forcesave setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.forcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/forcesave - Terminated user cannot change forcesave setting", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.forcesave();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/displayfileextension - Display file extension - Permissions", () => {
  test("PUT /api/2.0/files/displayfileextension - Unauthenticated user cannot change file extension display", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .filesSettings.displayFileExtension({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/displayfileextension - Owner can change file extension display", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.displayFileExtension({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayfileextension - DocSpaceAdmin can change own file extension display", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.displayFileExtension({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayfileextension - RoomAdmin can change own file extension display", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.displayFileExtension({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayfileextension - User can change own file extension display", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.displayFileExtension({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayfileextension - Guest can change own file extension display", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.displayFileExtension({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayfileextension - Terminated user cannot change file extension display", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.displayFileExtension({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/displayrecent - Display the Recent folder - Permissions", () => {
  test("PUT /api/2.0/files/displayrecent - Unauthenticated user cannot change Recent folder display", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .filesSettings.displayRecent({ displayRequestDto: { set: true } });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/displayrecent - Owner can change Recent folder display", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.displayRecent({ displayRequestDto: { set: true } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayrecent - DocSpaceAdmin can change own Recent folder display", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.displayRecent({ displayRequestDto: { set: true } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayrecent - RoomAdmin can change own Recent folder display", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.displayRecent({ displayRequestDto: { set: true } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayrecent - User can change own Recent folder display", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.displayRecent({ displayRequestDto: { set: true } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayrecent - Guest can change own Recent folder display", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.displayRecent({ displayRequestDto: { set: true } });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/displayrecent - Terminated user cannot change Recent folder display", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.displayRecent({
      displayRequestDto: { set: true },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/settings/autocleanup - Update trash bin auto-clearing setting - Permissions", () => {
  test("PUT /api/2.0/files/settings/autocleanup - Unauthenticated user cannot update auto-cleanup setting", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: { set: true },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/settings/autocleanup - DocSpaceAdmin can update auto-cleanup setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
  });

  test("PUT /api/2.0/files/settings/autocleanup - RoomAdmin can update own auto-cleanup setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
  });

  test("PUT /api/2.0/files/settings/autocleanup - User can update own auto-cleanup setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Guest can update own auto-cleanup setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.changeAutomaticallyCleanUp({
        autoCleanupRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response?.isAutoCleanUp).toBe(true);
  });

  test("PUT /api/2.0/files/settings/autocleanup - Terminated user cannot update auto-cleanup setting", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.changeAutomaticallyCleanUp({
      autoCleanupRequestDto: { set: true },
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/files/settings/autocleanup - Get trash bin auto-clearing setting - Permissions", () => {
  test("GET /api/2.0/files/settings/autocleanup - Unauthenticated user cannot read auto-cleanup setting", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/files/settings/autocleanup - Owner can read auto-cleanup setting", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.isAutoCleanUp).toBe("boolean");
  });

  test("GET /api/2.0/files/settings/autocleanup - DocSpaceAdmin can read own auto-cleanup setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.isAutoCleanUp).toBe("boolean");
  });

  test("GET /api/2.0/files/settings/autocleanup - RoomAdmin can read own auto-cleanup setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.isAutoCleanUp).toBe("boolean");
  });

  test("GET /api/2.0/files/settings/autocleanup - User can read own auto-cleanup setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.isAutoCleanUp).toBe("boolean");
  });

  test("GET /api/2.0/files/settings/autocleanup - Guest can read own auto-cleanup setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response?.isAutoCleanUp).toBe("boolean");
  });

  test("GET /api/2.0/files/settings/autocleanup - Terminated user cannot read auto-cleanup setting", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.getAutomaticallyCleanUp();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/storeoriginal - Change the ability to upload original formats - Permissions", () => {
  test("PUT /api/2.0/files/storeoriginal - Unauthenticated user cannot change store original setting", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().filesSettings.storeOriginal({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/storeoriginal - Owner can change store original setting", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.storeOriginal({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/storeoriginal - DocSpaceAdmin can change own store original setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.storeOriginal({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/storeoriginal - RoomAdmin can change own store original setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.storeOriginal({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/storeoriginal - User can change own store original setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.storeOriginal({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/storeoriginal - Guest can change own store original setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.storeOriginal({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/storeoriginal - Terminated user cannot change store original setting", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.storeOriginal({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/storeforcesave - Change the ability to store forcesaved file versions - Permissions", () => {
  test("PUT /api/2.0/files/storeforcesave - Unauthenticated user cannot change store forcesave setting", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .filesSettings.storeForcesave();

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/storeforcesave - Owner can change store forcesave setting", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.storeForcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/storeforcesave - DocSpaceAdmin can change own store forcesave setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.storeForcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/storeforcesave - RoomAdmin can change own store forcesave setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.storeForcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/storeforcesave - User can change own store forcesave setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.storeForcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/storeforcesave - Guest can change own store forcesave setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.storeForcesave();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(typeof data.response).toBe("boolean");
  });

  test("PUT /api/2.0/files/storeforcesave - Terminated user cannot change store forcesave setting", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.storeForcesave();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/settings/openeditorinsametab - Open document in the same browser tab - Permissions", () => {
  test("PUT /api/2.0/files/settings/openeditorinsametab - Unauthenticated user cannot change open-in-same-tab setting", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Owner can change open-in-same-tab setting", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - DocSpaceAdmin can change own open-in-same-tab setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - RoomAdmin can change own open-in-same-tab setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - User can change own open-in-same-tab setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Guest can change own open-in-same-tab setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.setOpenEditorInSameTab({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/settings/openeditorinsametab - Terminated user cannot change open-in-same-tab setting", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.setOpenEditorInSameTab({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/keepnewfilename - Ask a new file name on creation - Permissions", () => {
  test("PUT /api/2.0/files/keepnewfilename - Unauthenticated user cannot change keep-new-file-name setting", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .filesSettings.keepNewFileName({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/files/keepnewfilename - Owner can change keep-new-file-name setting", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .filesSettings.keepNewFileName({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/keepnewfilename - DocSpaceAdmin can change own keep-new-file-name setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.keepNewFileName({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/keepnewfilename - RoomAdmin can change own keep-new-file-name setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .filesSettings.keepNewFileName({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/keepnewfilename - User can change own keep-new-file-name setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .filesSettings.keepNewFileName({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/keepnewfilename - Guest can change own keep-new-file-name setting", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .filesSettings.keepNewFileName({
        settingsRequestDto: { set: true },
      });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/files/keepnewfilename - Terminated user cannot change keep-new-file-name setting", async ({
    apiSdk,
  }) => {
    const { api: userApi, data: userData } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    await apiSdk.forRole("owner").userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [userId], resendAll: false },
    });

    const { status } = await userApi.filesSettings.keepNewFileName({
      settingsRequestDto: { set: true },
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/files/settings/defaulttemplate - Permissions", () => {
  test("BUG 81953: PUT /api/2.0/files/settings/defaulttemplate - DocSpaceAdmin cannot set Owner's file as default template", async ({
    apiSdk,
  }) => {
    const { data: fileData } = await apiSdk
      .forRole("owner")
      .files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Default Template File.docx" },
      });
    const fileId = fileData.response!.id!;

    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .filesSettings.setDefaultTemplate({
        defaultTemplateSettingsRequestDto: {
          selectedFile: fileId,
          fileExtension: ".docx",
        },
      });

    expect(status).toBe(403);
    expect((data as any).error?.message).toBe(
      "You don't have enough permission to perform the operation",
    );
  });
});
