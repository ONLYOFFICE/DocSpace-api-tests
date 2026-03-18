import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

const QUOTA_MINIMAL_BYTES = 104857600; // 100 MB (QuotaPlan.Minimal)
const DEFAULT_QUOTA_USER_BYTES = 524288000; // 500 MB (DefaultQuota.User)

test.describe("PUT /people/userquota - Change user quota", () => {
  test("PUT /people/userquota - Change a owner quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const { data, status } = await ownerApi.peopleQuota.updateUserQuota({
      updateMembersQuotaRequestDto: { userIds: [ownerId], quota: QUOTA_MINIMAL_BYTES },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].isOwner).toBe(true);
    expect(data.response![0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
  });

  test("PUT /people/userquota - Owner change a other users quota limit", async ({
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

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data, status } = await ownerApi.peopleQuota.updateUserQuota({
      updateMembersQuotaRequestDto: { userIds: [docspaceAdminId, roomAdminId, userId], quota: QUOTA_MINIMAL_BYTES },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].isAdmin).toBe(true);
    expect(data.response![0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect(data.response![1].isRoomAdmin).toBe(true);
    expect(data.response![1].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect(data.response![2].isCollaborator).toBe(true);
    expect(data.response![2].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
  });

  test("PUT /people/userquota - DocSpaceAdmin change a other users quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data, status } = await adminApi.peopleQuota.updateUserQuota({
      updateMembersQuotaRequestDto: { userIds: [ownerId, roomAdminId, userId], quota: QUOTA_MINIMAL_BYTES },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].isOwner).toBe(true);
    expect(data.response![0].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect(data.response![1].isRoomAdmin).toBe(true);
    expect(data.response![1].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
    expect(data.response![2].isCollaborator).toBe(true);
    expect(data.response![2].quotaLimit).toBe(QUOTA_MINIMAL_BYTES);
  });
});

test.describe("PUT /people/resetquota - Reset user quota", () => {
  test("PUT /people/resetquota - Reset a owner quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    await ownerApi.peopleQuota.updateUserQuota({
      updateMembersQuotaRequestDto: { userIds: [ownerId], quota: QUOTA_MINIMAL_BYTES },
    });

    const { data, status } = await ownerApi.peopleQuota.resetUsersQuota({
      updateMembersQuotaRequestDto: { userIds: [ownerId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].isOwner).toBe(true);
    expect(data.response![0].quotaLimit).toBe(DEFAULT_QUOTA_USER_BYTES);
  });

  test("PUT /people/resetquota - Owner reset a other users quota limit", async ({
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

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await ownerApi.peopleQuota.updateUserQuota({
      updateMembersQuotaRequestDto: { userIds: [docspaceAdminId, roomAdminId, userId], quota: QUOTA_MINIMAL_BYTES },
    });

    const { data, status } = await ownerApi.peopleQuota.resetUsersQuota({
      updateMembersQuotaRequestDto: { userIds: [docspaceAdminId, roomAdminId, userId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].isAdmin).toBe(true);
    expect(data.response![0].quotaLimit).toBe(DEFAULT_QUOTA_USER_BYTES);
    expect(data.response![1].isRoomAdmin).toBe(true);
    expect(data.response![1].quotaLimit).toBe(DEFAULT_QUOTA_USER_BYTES);
    expect(data.response![2].isCollaborator).toBe(true);
    expect(data.response![2].quotaLimit).toBe(DEFAULT_QUOTA_USER_BYTES);
  });

  test("PUT /people/resetquota - DocSpaceAdmin reset a other users quota limit", async ({
    apiSdk,
    paymentsApi,
  }) => {
    await paymentsApi.setupPayment();
    await apiSdk.enableUserQuota("owner", DEFAULT_QUOTA_USER_BYTES);

    const ownerApi = apiSdk.forRole("owner");
    const { data: selfData } = await ownerApi.profiles.getSelfProfile();
    const ownerId = selfData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    await adminApi.peopleQuota.updateUserQuota({
      updateMembersQuotaRequestDto: { userIds: [ownerId, roomAdminId, userId], quota: QUOTA_MINIMAL_BYTES },
    });

    const { data, status } = await adminApi.peopleQuota.resetUsersQuota({
      updateMembersQuotaRequestDto: { userIds: [ownerId, roomAdminId, userId] },
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response![0].isOwner).toBe(true);
    expect(data.response![0].quotaLimit).toBe(DEFAULT_QUOTA_USER_BYTES);
    expect(data.response![1].isRoomAdmin).toBe(true);
    expect(data.response![1].quotaLimit).toBe(DEFAULT_QUOTA_USER_BYTES);
    expect(data.response![2].isCollaborator).toBe(true);
    expect(data.response![2].quotaLimit).toBe(DEFAULT_QUOTA_USER_BYTES);
  });
});
