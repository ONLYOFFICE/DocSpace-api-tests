import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

const QUOTA_MINIMAL_BYTES = 104857600; // 100 MB (QuotaPlan.Minimal)
const DEFAULT_QUOTA_USER_BYTES = 524288000; // 500 MB (DefaultQuota.User)

test.describe("PUT /people/userquota - access control", () => {
  test("PUT /people/userquota - Change a roomAdmin quota limit himself", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const { data: roomAdminData, api: roomAdminApi } =
      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");
    const roomAdminId = roomAdminData.response!.id!;

    const { data } = await roomAdminApi.peopleQuota.updateUserQuota({
      userIds: [roomAdminId],
      quota: QUOTA_MINIMAL_BYTES,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/userquota - Room admin change a other users quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );
    const { data } = await roomAdminApi.peopleQuota.updateUserQuota({
      userIds: [ownerId, docSpaceAdminId, userId],
      quota: QUOTA_MINIMAL_BYTES,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/userquota - User change a other users quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

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

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const { data } = await userApi.peopleQuota.updateUserQuota({
      userIds: [ownerId, docSpaceAdminId, roomAdminId],
      quota: QUOTA_MINIMAL_BYTES,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/userquota - Guest change a other users quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

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
    const { data } = await guestApi.peopleQuota.updateUserQuota({
      userIds: [ownerId, docSpaceAdminId, roomAdminId, userId],
      quota: QUOTA_MINIMAL_BYTES,
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/userquota - Change a quota limit user without autorization", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const anonApi = apiSdk.forAnonymous();
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { status } = await anonApi.peopleQuota.updateUserQuota({
      userIds: [roomAdminId],
      quota: QUOTA_MINIMAL_BYTES,
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /people/resetquota - access control", () => {
  test("PUT /people/resetquota - Reset a roomAdmin quota limit himself", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.peopleQuota.updateUserQuota({
      userIds: [roomAdminId],
      quota: QUOTA_MINIMAL_BYTES,
    });
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.peopleQuota.resetUsersQuota({
      userIds: [roomAdminId],
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/resetquota - Room admin has reset the quota limit of other users.", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const { data: docSpaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docSpaceAdminId = docSpaceAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.peopleQuota.updateUserQuota({
      userIds: [ownerId, docSpaceAdminId, userId],
      quota: QUOTA_MINIMAL_BYTES,
    });
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data } = await roomAdminApi.peopleQuota.resetUsersQuota({
      userIds: [ownerId, docSpaceAdminId, userId],
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/resetquota - User has reset the quota limit of other users.", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

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

    await ownerApi.peopleQuota.updateUserQuota({
      userIds: [ownerId, docSpaceAdminId, roomAdminId],
      quota: QUOTA_MINIMAL_BYTES,
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data } = await userApi.peopleQuota.resetUsersQuota({
      userIds: [ownerId, docSpaceAdminId, roomAdminId],
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/resetquota - Guest has reset the quota limit of other users.", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

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

    await ownerApi.peopleQuota.updateUserQuota({
      userIds: [ownerId, docSpaceAdminId, roomAdminId, userId],
      quota: QUOTA_MINIMAL_BYTES,
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data } = await guestApi.peopleQuota.resetUsersQuota({
      userIds: [ownerId, docSpaceAdminId, roomAdminId, userId],
    });

    expect(data.statusCode).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /people/resetquota - Reset a quota limit user without autorization", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const anonApi = apiSdk.forAnonymous();
    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.peopleQuota.updateUserQuota({
      userIds: [roomAdminId],
      quota: QUOTA_MINIMAL_BYTES,
    });

    const { status } = await anonApi.peopleQuota.resetUsersQuota({
      userIds: [roomAdminId],
    });

    expect(status).toBe(401);
  });

    test("Bug 80301: PUT /people/userquota - Owner changes the user's quota limit to a value higher than the total storage size", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: docspaceAdminData } = await apiSdk.addMember(
      "owner",
      "DocSpaceAdmin",
    );
    const docspaceAdminId = docspaceAdminData.response!.id!;

    const OVER_SIZE_BYTES = 999999999999999; // exceeds total storage

    const { data } = await ownerApi.peopleQuota.updateUserQuota({
      userIds: [docspaceAdminId],
      quota: OVER_SIZE_BYTES,
    });
    expect(data.statusCode).toBe(400);
    expect((data as any).error.message).toBe(
      "Failed to set quota per user. The entered value is greater than the total DocSpace storage.",
    );
  });
});
