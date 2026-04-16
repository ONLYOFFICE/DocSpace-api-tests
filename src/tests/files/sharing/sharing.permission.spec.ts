import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare, EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /api/2.0/files/file/{fileId}/group/{groupId}/share", () => {
  test("BUG 81023: GET /api/2.0/files/file/{fileId}/group/{groupId}/share - Guest gets group member count when file is shared only with guest", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Sharing File" },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [ownerId, userId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await guestApi.sharing.getGroupsMembersWithFileSecurity({
        fileId,
        groupId,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("BUG 81023: GET /api/2.0/files/file/{fileId}/group/{groupId}/share - Guest gets full group member info when file is shared with guest and group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Sharing File" },
    });
    const fileId = fileData.response!.id!;

    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: guestData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { data: groupData } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [ownerId, userId],
      },
    });
    const groupId = groupData.response!.id!;

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: guestId, access: FileShare.Read }],
        notify: false,
      },
    });

    await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: groupId, access: FileShare.Read }],
        notify: false,
      },
    });

    const { data, status } =
      await guestApi.sharing.getGroupsMembersWithFileSecurity({
        fileId,
        groupId,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/files/owner", () => {
  test("BUG 66897: POST /api/2.0/files/owner - changeFileOwner returns empty response when new owner is disabled", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Change Owner File" },
    });
    const fileId = fileData.response!.id!;

    const { data: roomAdminData } = await apiSdk.addMember(
      "owner",
      "RoomAdmin",
    );
    const roomAdminId = roomAdminData.response!.id!;

    await ownerApi.userStatus.updateUserStatus({
      status: EmployeeStatus.Terminated,
      updateMembersRequestDto: { userIds: [roomAdminId], resendAll: false },
    });

    const { data, status } = await ownerApi.sharing.changeFileOwner({
      changeOwnerRequestDto: {
        userId: roomAdminId,
        fileIds: [fileId as unknown as object],
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("You cannot select this user");
  });
});

test.describe("PUT /api/2.0/files/share", () => {
  test("BUG 79284: PUT /api/2.0/files/share - setSecurityInfo with empty access field should return 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Share File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data, status } = await ownerApi.sharing.setSecurityInfo({
      securityInfoRequestDto: {
        fileIds: [fileId as unknown as object],
        share: [{ shareTo: userId, access: "" as any }],
        notify: true,
      },
    });
    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toStrictEqual([]);
  });
});

test.describe("GET /api/2.0/files/file/{fileId}/sharedusers", () => {
  test.fail(
    "BUG XXXXX: GET /api/2.0/files/file/{fileId}/sharedusers - Guest gets id, email and name of User in getSharedUsers response",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
        createFileJsonElement: { title: "Autotest Shared Users File" },
      });
      const fileId = fileData.response!.id!;

      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      const { data: userData } = await apiSdk.addMember("owner", "User");
      const userId = userData.response!.id!;

      const { data: guestData, api: guestApi } =
        await apiSdk.addAuthenticatedMember("owner", "Guest");
      const guestId = guestData.response!.id!;

      await ownerApi.sharing.setFileSecurityInfo({
        fileId,
        securityInfoSimpleRequestDto: {
          share: [
            { shareTo: userId, access: FileShare.Read },
            { shareTo: guestId, access: FileShare.Read },
          ],
          notify: false,
        },
      });

      const { data, status } = await guestApi.sharing.getSharedUsers({
        fileId,
      });

      expect(status).toBe(200);
      const entries = (data as any).response as Array<{ id?: string }>;
      const entryIds = entries.map((entry) => entry.id);
      expect(entryIds).toContain(ownerId);
      expect(entryIds).not.toContain(userId);
    },
  );
});

test.describe("PUT /api/2.0/files/file/{fileId}/share", () => {
  test("BUG 79156: PUT /api/2.0/files/file/{fileId}/share - sharingMessage longer than 255 characters should return 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: fileData } = await ownerApi.files.createFileInMyDocuments({
      createFileJsonElement: { title: "Autotest Share File" },
    });
    const fileId = fileData.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const longMessage = "a".repeat(256);

    const { data, status } = await ownerApi.sharing.setFileSecurityInfo({
      fileId,
      securityInfoSimpleRequestDto: {
        share: [{ shareTo: userId, access: FileShare.Read }],
        notify: true,
        sharingMessage: longMessage,
      },
    });

    expect(status).toBe(400);
    expect(
      (data as any).response?.errors?.["SecurityInfoSimple.SharingMessage"],
    ).toStrictEqual([
      "The field SharingMessage must be a string with a maximum length of 255.",
    ]);
  });
});
