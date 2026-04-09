import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeStatus } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /group/:id/members - Replace group members", () => {
  test.fail(
    "BUG 79368: POST /group/:id/members - DocSpace admin sets a disabled user replaces all existing members with empty list",
    async ({ apiSdk }) => {
      // Create one active user as the initial group member
      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const memberId = memberData.response!.id!;

      // Create a user that will be disabled
      const { data: disabledUserData } = await apiSdk.addMember(
        "owner",
        "User",
      );
      const disabledUserId = disabledUserData.response!.id!;

      // Create DocSpace admin and get their ID to use as group manager
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );
      const { data: adminProfile } = await adminApi.profiles.getSelfProfile();
      const adminId = adminProfile.response!.id!;

      // DocSpace admin creates a group with one active member
      const { data: groupData } = await adminApi.groupApi.addGroup({
        groupRequestDto: {
          groupManager: adminId,
          groupName: "Autotest Group",
          members: [memberId],
        },
      });
      const groupId = groupData.response!.id!;

      // Owner blocks the user
      const ownerApi = await apiSdk.authenticateOwner();
      await ownerApi.userStatus.updateUserStatus({
        status: EmployeeStatus.Terminated,
        updateMembersRequestDto: { userIds: [disabledUserId] },
      });

      // DocSpace admin tries to replace group members with a disabled user
      const { data } = await adminApi.groupApi.setMembersTo({
        id: groupId,
        membersRequest: { members: [disabledUserId] },
      });

      // Expected: error because disabled users cannot be added to a group
      // Actual: all existing members are removed and the group becomes empty
      expect(data.statusCode).toBe(400);

      // Original active member should still be in the group after the failed request
      const { data: groupAfter } = await adminApi.groupApi.getGroup({
        id: groupId,
        includeMembers: true,
      });
      expect(
        groupAfter.response?.members?.some((m) => m.id === memberId),
      ).toBe(true);
    },
  );

});
