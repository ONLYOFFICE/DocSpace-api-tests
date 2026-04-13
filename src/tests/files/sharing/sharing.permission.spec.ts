import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { FileShare } from "@onlyoffice/docspace-api-sdk";

test.describe("GET /api/2.0/files/file/{fileId}/group/{groupId}/share", () => {
  test.fail(
    "BUG XXXXX: GET /api/2.0/files/file/{fileId}/group/{groupId}/share - Guest gets group member count when file is shared only with guest",
    async ({ apiSdk }) => {
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
    },
  );

  test.fail(
    "BUG XXXXX: GET /api/2.0/files/file/{fileId}/group/{groupId}/share - Guest gets full group member info when file is shared with guest and group",
    async ({ apiSdk }) => {
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
    },
  );
});
