import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { faker } from "@faker-js/faker";

test.describe("POST /api/2.0/group - validation and edge cases", () => {
  // ❌ Required fields validation

  test("BUG 81417: POST /api/2.0/group - Owner cannot create group without groupName", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupManager: ownerId,
      } as any,
    });

    expect(status).toBe(400);
  });

  test("BUG 81485: POST /api/2.0/group - Owner can create group without groupManager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
      } as any,
    });

    expect(status).toBe(200);
  });

  test("BUG 81418: POST /api/2.0/group - Owner cannot create group with empty groupName", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: "",
        groupManager: ownerId,
      },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/group - Owner cannot create group with empty groupManager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: "",
      },
    });

    expect(status).toBe(400);
  });

  // ⚠️ Invalid data

  test("BUG 81419: POST /api/2.0/group - Owner cannot create group with non-existent groupManager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: faker.string.uuid(),
      },
    });

    expect(status).toBe(400);
  });

  test("BUG 81420: POST /api/2.0/group - Owner cannot create group with non-existent user in members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [faker.string.uuid()],
      },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/group - Owner cannot create group when members is not an array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: "not-an-array" as any,
      },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/group - Owner cannot create group when groupName is not a string", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: 123 as any,
        groupManager: ownerId,
      },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/group - Owner cannot create group when groupManager is not a string", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: 123 as any,
      },
    });

    expect(status).toBe(400);
  });

  // 🔍 Edge cases

  test("POST /api/2.0/group - Owner cannot create group with very long groupName", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(255),
        groupManager: ownerId,
      },
    });

    expect(status).toBe(400);
  });

  test("BUG 81421: POST /api/2.0/group - Owner cannot create group with spaces-only groupName", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: "   ",
        groupManager: ownerId,
      },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/group - Owner creates group with special characters in groupName", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const groupName = "Test Group !@#$%^&*()";

    const { data, status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
      },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(groupName);
  });

  test("POST /api/2.0/group - Owner creates group with unicode groupName", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const groupName = "Тестовая группа 테스트 グループ";

    const { data, status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
      },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(groupName);
  });

  test("POST /api/2.0/group - Owner creates group with duplicate users in members and they are deduplicated", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data, status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId, memberId],
      },
    });

    expect(status).toBe(200);

    const groupId = data.response!.id!;
    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds.filter((id) => id === memberId)).toHaveLength(1);
  });
});

test.describe("GET /api/2.0/group/{id} - negative scenarios", () => {
  test("GET /api/2.0/group/{id} - Returns 404 for non-existing group id", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").groupApi.getGroup({
      id: faker.string.uuid(),
    });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/{id} - Returns 404 for invalid id format", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").groupApi.getGroup({
      id: "invalid-id-format",
    });

    expect(status).toBe(404);
  });
});

test.describe("POST /api/2.0/group - permissions", () => {
  test("POST /api/2.0/group - DocSpace admin can create group", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    const { data: adminProfile } = await adminApi.profiles.getSelfProfile();
    const adminId = adminProfile.response!.id!;

    const { status } = await adminApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: adminId,
      },
    });

    expect(status).toBe(200);
  });

  test("POST /api/2.0/group - Anonymous cannot create group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/group - User cannot create group", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/group - Room admin cannot create group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    expect(status).toBe(403);
  });

  test("POST /api/2.0/group - Guest cannot create group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/group/{id} - permissions", () => {
  test("GET /api/2.0/group/{id} - Anonymous cannot get group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.getGroup({
      id: groupId,
    });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/group/{id} - DocSpace admin can get group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.groupApi.getGroup({ id: groupId });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/group/{id} - Room admin can get group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.getGroup({ id: groupId });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/group/{id} - User cannot get group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.getGroup({ id: groupId });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/{id} - Guest cannot get group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.getGroup({ id: groupId });

    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/group - permissions", () => {
  test("GET /api/2.0/group - Anonymous cannot get groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { status } = await apiSdk.forAnonymous().groupApi.getGroups({});

    expect(status).toBe(401);
  });

  test("GET /api/2.0/group - Guest cannot get groups", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.getGroups({});

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group - User cannot get groups", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.getGroups({});

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group - Room admin can get groups", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.getGroups({});

    expect(status).toBe(200);
  });

  test("GET /api/2.0/group - DocSpace admin can get groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.groupApi.getGroups({});

    expect(status).toBe(200);
  });
});

test.describe("PUT /api/2.0/group/{id} - validation and negative cases", () => {
  test("PUT /api/2.0/group/{id} - Returns 404 for non-existing groupId", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").groupApi.updateGroup({
      id: faker.string.uuid(),
      updateGroupRequest: { groupName: apiSdk.faker.generateString(10) },
    });

    expect(status).toBe(404);
  });

  test("PUT /api/2.0/group/{id} - Non-existing groupManager is not set as group manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const nonExistingUserId = faker.string.uuid();
    const { data, status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { groupManager: nonExistingUserId },
    });

    expect(status).toBe(200);
    expect(data.response?.manager?.id).not.toBe(nonExistingUserId);
  });

  test("PUT /api/2.0/group/{id} - Non-existing user in membersToAdd is not added to group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const nonExistingUserId = faker.string.uuid();
    const { status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { membersToAdd: [nonExistingUserId] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(
      groupData.response?.members?.some((m) => m.id === nonExistingUserId),
    ).toBe(false);
  });

  test("PUT /api/2.0/group/{id} - Removing non-member user returns 200 and group remains unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: nonMemberData } = await apiSdk.addMember("owner", "User");
    const nonMemberId = nonMemberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { membersToRemove: [nonMemberId] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.members?.some((m) => m.id === nonMemberId)).toBe(
      false,
    );
  });

  test("PUT /api/2.0/group/{id} - membersToRemove has priority when same user is in add and remove lists", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: {
        membersToAdd: [memberId],
        membersToRemove: [memberId],
      },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const isMember = groupData.response?.members?.some(
      (m) => m.id === memberId,
    );
    expect(isMember).toBe(false);
  });
});

test.describe("PUT /api/2.0/group/{id} - permissions", () => {
  test("PUT /api/2.0/group/{id} - DocSpace admin can update group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const newName = apiSdk.faker.generateString(10);
    const { data, status } = await adminApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { groupName: newName },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(newName);
  });

  test("PUT /api/2.0/group/{id} - Anonymous cannot update group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { groupName: apiSdk.faker.generateString(10) },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/group/{id} - Room admin cannot update group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { groupName: apiSdk.faker.generateString(10) },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{id} - User cannot update group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { groupName: apiSdk.faker.generateString(10) },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{id} - Guest cannot update group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { groupName: apiSdk.faker.generateString(10) },
    });

    expect(status).toBe(403);
  });
});

test.describe("PUT /api/2.0/group/{id}/members - validation and negative cases", () => {
  test("PUT /api/2.0/group/{id}/members - Returns 404 for non-existing groupId", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { status } = await apiSdk.forRole("owner").groupApi.addMembersTo({
      id: faker.string.uuid(),
      membersRequest: { members: [memberId] },
    });

    expect(status).toBe(404);
  });

  test("PUT /api/2.0/group/{id}/members - Non-existing user in members is silently ignored", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const nonExistingUserId = faker.string.uuid();
    const { status } = await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [nonExistingUserId] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(
      groupData.response?.members?.some((m) => m.id === nonExistingUserId),
    ).toBe(false);
  });

  test("PUT /api/2.0/group/{id}/members - Empty members array returns 200 and group is unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    const { status } = await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount);
  });

  test.fail(
    "BUG 81484: PUT /api/2.0/group/{id}/members - Null members returns 200 and group is unchanged",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      const { data: created } = await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
      const groupId = created.response!.id!;
      const initialCount = created.response!.membersCount!;

      const { status } = await ownerApi.groupApi.addMembersTo({
        id: groupId,
        membersRequest: { members: null },
      });

      expect(status).toBe(200);

      const { data: groupData } = await ownerApi.groupApi.getGroup({
        id: groupId,
        includeMembers: true,
      });
      expect(groupData.response?.membersCount).toBe(initialCount);
    },
  );
});

test.describe("PUT /api/2.0/group/{id}/members - permissions", () => {
  test("PUT /api/2.0/group/{id}/members - DocSpace admin can add members to group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { data: memberToAdd } = await apiSdk.addMember("owner", "User");
    const memberToAddId = memberToAdd.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberToAddId] },
    });

    expect(status).toBe(200);
    const memberIds = data.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(memberToAddId);
  });

  test("PUT /api/2.0/group/{id}/members - Anonymous cannot add members to group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { data: memberToAdd } = await apiSdk.addMember("owner", "User");
    const memberToAddId = memberToAdd.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberToAddId] },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/group/{id}/members - Room admin cannot add members to group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { data: memberToAdd } = await apiSdk.addMember("owner", "User");
    const memberToAddId = memberToAdd.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberToAddId] },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{id}/members - User cannot add members to group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { data: memberToAdd } = await apiSdk.addMember("owner", "User");
    const memberToAddId = memberToAdd.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberToAddId] },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{id}/members - Guest cannot add members to group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { data: memberToAdd } = await apiSdk.addMember("owner", "User");
    const memberToAddId = memberToAdd.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberToAddId] },
    });

    expect(status).toBe(403);
  });
});

test.describe("GET /api/2.0/group - Edge cases and invalid params", () => {
  test("GET /api/2.0/group - empty params object and no params return same result", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { data: withEmpty, status: s1 } = await ownerApi.groupApi.getGroups(
      {},
    );
    const { data: withUndefined, status: s2 } =
      await ownerApi.groupApi.getGroups();

    expect(s1).toBe(s2);
    const emptyIds = withEmpty.response?.map((g) => g.id).sort();
    const undefinedIds = withUndefined.response?.map((g) => g.id).sort();
    expect(emptyIds).toEqual(undefinedIds);
  });

  test("GET /api/2.0/group - non-existent userId returns empty array", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .groupApi.getGroups({ userId: faker.string.uuid() });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /api/2.0/group - invalid userId format returns 400", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .groupApi.getGroups({ userId: "not-a-valid-id" });

    expect(status).toBe(400);
  });

  test("GET /api/2.0/group - invalid sortBy is ignored", async ({ apiSdk }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .groupApi.getGroups({ sortBy: "NonExistentField" });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/group - invalid sortOrder returns 400", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .groupApi.getGroups({ sortOrder: 99 as any });

    expect(status).toBe(400);
  });
});

test.describe("DELETE /api/2.0/group/{id} - negative scenarios", () => {
  test("DELETE /api/2.0/group/{id} - Returns 404 for non-existing group id", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forRole("owner").groupApi.deleteGroup({
      id: faker.string.uuid(),
    });

    expect(status).toBe(404);
  });

  test("DELETE /api/2.0/group/{id} - Deleting an already deleted group returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.deleteGroup({ id: groupId });

    const { status } = await ownerApi.groupApi.deleteGroup({ id: groupId });

    expect(status).toBe(404);
  });
});

test.describe("DELETE /api/2.0/group/{id} - permissions", () => {
  test("DELETE /api/2.0/group/{id} - User cannot delete group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.deleteGroup({ id: groupId });

    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/group/{id} - Anonymous cannot delete group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.deleteGroup({
      id: groupId,
    });

    expect(status).toBe(401);
  });
});

test.describe("GET /api/2.0/group/user/{userid} - validation and negative cases", () => {
  test("GET /api/2.0/group/user/{userid} - Returns 404 for invalid userId format", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .groupApi.getGroupByUserId({ userid: "not-a-valid-id" });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/user/{userid} - Returns empty array for non-existing userId", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .groupApi.getGroupByUserId({ userid: faker.string.uuid() });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /api/2.0/group/user/{userid} - Returns 404 for empty userId", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forRole("owner")
      .groupApi.getGroupByUserId({ userid: "" });

    expect(status).toBe(404);
  });

  test("GET /api/2.0/group/user/{userid} - Throws RequiredError for null userId", async ({
    apiSdk,
  }) => {
    await expect(
      apiSdk
        .forRole("owner")
        .groupApi.getGroupByUserId({ userid: null as unknown as string }),
    ).rejects.toThrow(/userid/);
  });

  test("GET /api/2.0/group/user/{userid} - Throws RequiredError for undefined userId", async ({
    apiSdk,
  }) => {
    await expect(
      apiSdk
        .forRole("owner")
        .groupApi.getGroupByUserId({ userid: undefined as unknown as string }),
    ).rejects.toThrow(/userid/);
  });
});

test.describe("GET /api/2.0/group/user/{userid} - permissions", () => {
  test("GET /api/2.0/group/user/{userid} - DocSpace admin can get groups by another user id", async ({
    apiSdk,
  }) => {
    const { data: targetData } = await apiSdk.addMember("owner", "User");
    const targetId = targetData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.groupApi.getGroupByUserId({
      userid: targetId,
    });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/group/user/{userid} - Room admin can get groups by another user id", async ({
    apiSdk,
  }) => {
    const { data: targetData } = await apiSdk.addMember("owner", "User");
    const targetId = targetData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.getGroupByUserId({
      userid: targetId,
    });

    expect(status).toBe(200);
  });

  test("GET /api/2.0/group/user/{userid} - User cannot get own groups", async ({
    apiSdk,
  }) => {
    const { data: userData, api: userApi } =
      await apiSdk.addAuthenticatedMember("owner", "User");
    const userId = userData.response!.id!;

    const { status } = await userApi.groupApi.getGroupByUserId({
      userid: userId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/user/{userid} - User cannot get another user groups", async ({
    apiSdk,
  }) => {
    const { data: targetData } = await apiSdk.addMember("owner", "User");
    const targetId = targetData.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.getGroupByUserId({
      userid: targetId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/user/{userid} - Guest cannot get own groups", async ({
    apiSdk,
  }) => {
    const { data: guestData, api: guestApi } =
      await apiSdk.addAuthenticatedMember("owner", "Guest");
    const guestId = guestData.response!.id!;

    const { status } = await guestApi.groupApi.getGroupByUserId({
      userid: guestId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/user/{userid} - Guest cannot get another user groups", async ({
    apiSdk,
  }) => {
    const { data: targetData } = await apiSdk.addMember("owner", "User");
    const targetId = targetData.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.getGroupByUserId({
      userid: targetId,
    });

    expect(status).toBe(403);
  });

  test("GET /api/2.0/group/user/{userid} - Anonymous cannot get groups by userId", async ({
    apiSdk,
  }) => {
    const { data: targetData } = await apiSdk.addMember("owner", "User");
    const targetId = targetData.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.getGroupByUserId({
      userid: targetId,
    });

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/group/{fromId}/members/{toId} - validation and edge cases", () => {
  test("PUT /api/2.0/group/{fromId}/members/{toId} - Calling with fromId equals toId does not corrupt group members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.moveMembersTo({
      fromId: groupId,
      toId: groupId,
    });
    expect(status).toBeLessThan(500);

    const { data: after } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = after.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Returns 404 for non-existing fromId and target stays unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: tgtMember } = await apiSdk.addMember("owner", "User");
    const tgtMemberId = tgtMember.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [tgtMemberId],
      },
    });
    const toId = target.response!.id!;

    const { status } = await ownerApi.groupApi.moveMembersTo({
      fromId: faker.string.uuid(),
      toId,
    });
    expect(status).toBe(404);

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const memberIds = targetAfter.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(tgtMemberId);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Returns 404 for non-existing toId and source stays unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: srcMember } = await apiSdk.addMember("owner", "User");
    const srcMemberId = srcMember.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [srcMemberId],
      },
    });
    const fromId = source.response!.id!;

    const { status } = await ownerApi.groupApi.moveMembersTo({
      fromId,
      toId: faker.string.uuid(),
    });
    expect(status).toBe(404);

    const { data: sourceAfter } = await ownerApi.groupApi.getGroup({
      id: fromId,
      includeMembers: true,
    });
    const memberIds = sourceAfter.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(srcMemberId);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Move from deleted source group returns 404", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const toId = target.response!.id!;

    await ownerApi.groupApi.deleteGroup({ id: fromId });

    const { status } = await ownerApi.groupApi.moveMembersTo({ fromId, toId });
    expect(status).toBe(404);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Target group manager is preserved after move", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: srcManager } = await apiSdk.addMember("owner", "User");
    const srcManagerId = srcManager.response!.id!;
    const { data: srcMember } = await apiSdk.addMember("owner", "User");
    const srcMemberId = srcMember.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: srcManagerId,
        members: [srcMemberId],
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const toId = target.response!.id!;

    await ownerApi.groupApi.moveMembersTo({ fromId, toId });

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    expect(targetAfter.response?.manager?.id).toBe(ownerId);
  });
});

test.describe("PUT /api/2.0/group/{fromId}/members/{toId} - permissions", () => {
  test("PUT /api/2.0/group/{fromId}/members/{toId} - DocSpace admin can move members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const toId = target.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { status } = await adminApi.groupApi.moveMembersTo({ fromId, toId });
    expect(status).toBe(200);

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const memberIds = targetAfter.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Room admin cannot move members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const toId = target.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.moveMembersTo({
      fromId,
      toId,
    });
    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - User cannot move members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const toId = target.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.moveMembersTo({ fromId, toId });
    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Guest cannot move members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const toId = target.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.moveMembersTo({ fromId, toId });
    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Anonymous cannot move members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const toId = target.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.moveMembersTo({
      fromId,
      toId,
    });
    expect(status).toBe(401);
  });
});

test.describe("DELETE /api/2.0/group/{id}/members - validation and negative cases", () => {
  test("DELETE /api/2.0/group/{id}/members - Returns 404 for non-existing groupId", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { status } = await apiSdk
      .forRole("owner")
      .groupApi.removeMembersFrom({
        id: faker.string.uuid(),
        membersRequest: { members: [memberId] },
      });

    expect(status).toBe(404);
  });

  test("DELETE /api/2.0/group/{id}/members - Returns 404 for invalid groupId format", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { status } = await apiSdk
      .forRole("owner")
      .groupApi.removeMembersFrom({
        id: "not-a-valid-id",
        membersRequest: { members: [memberId] },
      });

    expect(status).toBe(404);
  });

  test("DELETE /api/2.0/group/{id}/members - Non-existing user in members is silently ignored", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [faker.string.uuid()] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount);
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - Invalid userId format in members is silently ignored", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: ["not-a-valid-id"] },
    });
    expect(status).toBeLessThan(500);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount);
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - Removing a user who is not a member of the group is a no-op", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;
    const { data: outsider } = await apiSdk.addMember("owner", "User");
    const outsiderId = outsider.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [outsiderId] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount);
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
    expect(memberIds).not.toContain(outsiderId);
  });

  test("DELETE /api/2.0/group/{id}/members - Empty members array returns 200 and group is unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount);
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - Missing membersRequest is rejected by the SDK", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    await expect(
      ownerApi.groupApi.removeMembersFrom({
        id: groupId,
        membersRequest: undefined as unknown as { members: string[] },
      }),
    ).rejects.toThrow(/membersRequest/);
  });

  test.fail(
    "BUG 81509: DELETE /api/2.0/group/{id}/members - Null members returns 200 and group is unchanged",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      const { data: memberData } = await apiSdk.addMember("owner", "User");
      const memberId = memberData.response!.id!;

      const { data: created } = await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
          members: [memberId],
        },
      });
      const groupId = created.response!.id!;
      const initialCount = created.response!.membersCount!;

      const { status } = await ownerApi.groupApi.removeMembersFrom({
        id: groupId,
        membersRequest: { members: null },
      });
      expect(status).toBe(200);

      const { data: groupData } = await ownerApi.groupApi.getGroup({
        id: groupId,
        includeMembers: true,
      });
      expect(groupData.response?.membersCount).toBe(initialCount);
      const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
      expect(memberIds).toContain(memberId);
    },
  );

  test("BUG 81510: DELETE /api/2.0/group/{id}/members - Undefined members returns 200 and group is unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: undefined },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount);
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - Duplicate user IDs in members are handled idempotently", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;
    const { data: keep } = await apiSdk.addMember("owner", "User");
    const keepId = keep.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId, keepId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId, memberId, memberId] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(memberId);
    expect(memberIds).toContain(keepId);
  });

  test("DELETE /api/2.0/group/{id}/members - Mixed valid and invalid user IDs leaves the group unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;
    const { data: keep } = await apiSdk.addMember("owner", "User");
    const keepId = keep.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId, keepId],
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: {
        members: [memberId, faker.string.uuid(), "not-a-valid-id"],
      },
    });
    expect(status).toBeLessThan(500);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount);
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
    expect(memberIds).toContain(keepId);
  });
});

test.describe("DELETE /api/2.0/group/{id}/members - permissions", () => {
  test("DELETE /api/2.0/group/{id}/members - DocSpace admin can remove members from group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    expect(status).toBe(200);
    const memberIds = data.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - Group manager who is a regular user cannot remove members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const managerCreated = await apiSdk.addMember("owner", "User");
    const managerId = managerCreated.data.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: managerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const managerApi = await apiSdk.authenticateMember(
      managerCreated.userData,
      "User",
    );

    const { status } = await managerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/group/{id}/members - Room admin cannot remove members from group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/group/{id}/members - User cannot remove members from group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/group/{id}/members - Guest cannot remove members from group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(status).toBe(403);
  });

  test("DELETE /api/2.0/group/{id}/members - Anonymous cannot remove members from group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/group/{id}/manager - validation and negative cases", () => {
  test("PUT /api/2.0/group/{id}/manager - Returns 404 for non-existing groupId", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { status } = await apiSdk.forRole("owner").groupApi.setGroupManager({
      id: faker.string.uuid(),
      setManagerRequest: { userId: memberId },
    });

    expect(status).toBe(404);
  });

  test("PUT /api/2.0/group/{id}/manager - Returns 404 for non-existing userId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: faker.string.uuid() },
    });

    expect(status).toBe(404);
  });

  test("PUT /api/2.0/group/{id}/manager - Returns validation error for empty userId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: "" },
    });

    expect(status).toBe(400);
  });

  test("PUT /api/2.0/group/{id}/manager - Returns validation error for null userId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: null } as any,
    });

    expect(status).toBe(400);
  });

  test("PUT /api/2.0/group/{id}/manager - Returns validation error when userId is missing", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: {} as any,
    });

    expect(status).toBe(400);
  });

  test("PUT /api/2.0/group/{id}/manager - SDK rejects null request body before sending request", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    await expect(
      ownerApi.groupApi.setGroupManager({
        id: groupId,
        setManagerRequest: null as any,
      }),
    ).rejects.toThrow(
      "Required parameter setManagerRequest was null or undefined",
    );
  });
});

test.describe("PUT /api/2.0/group/{id}/manager - permissions", () => {
  test("PUT /api/2.0/group/{id}/manager - DocSpace admin can set group manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    expect(status).toBe(200);
    expect(data.response?.manager?.id).toBe(newManagerId);
  });

  test("PUT /api/2.0/group/{id}/manager - Room admin cannot set group manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{id}/manager - User cannot set group manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{id}/manager - Guest cannot set group manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    expect(status).toBe(403);
  });

  test("PUT /api/2.0/group/{id}/manager - Anonymous cannot set group manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/group/{id}/members - validation and negative cases", () => {
  test("POST /api/2.0/group/{id}/members - Returns 404 for non-existing groupId", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { status } = await apiSdk.forRole("owner").groupApi.setMembersTo({
      id: faker.string.uuid(),
      membersRequest: { members: [memberId] },
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/group/{id}/members - Returns 404 for invalid groupId format", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { status } = await apiSdk.forRole("owner").groupApi.setMembersTo({
      id: "not-a-uuid",
      membersRequest: { members: [memberId] },
    });

    expect(status).toBe(404);
  });

  test("POST /api/2.0/group/{id}/members - Non-existing userId in members returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [faker.string.uuid()] },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/group/{id}/members - Invalid userId format in members returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: ["not-a-uuid"] },
    });

    expect(status).toBe(400);
  });

  test("POST /api/2.0/group/{id}/members - Empty members array returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [] },
    });
    expect(status).toBe(400);
  });

  test("POST /api/2.0/group/{id}/members - Empty membersRequest body returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: {},
    });
    expect(status).toBe(400);
  });

  test("POST /api/2.0/group/{id}/members - members = null returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: null },
    });
    expect(status).toBe(400);
  });

  test("POST /api/2.0/group/{id}/members - members = undefined returns 400", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: undefined },
    });
    expect(status).toBe(400);
  });
});

test.describe("POST /api/2.0/group/{id}/members - permissions", () => {
  test("POST /api/2.0/group/{id}/members - DocSpace admin can replace group members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: oldMember } = await apiSdk.addMember("owner", "User");
    const oldMemberId = oldMember.response!.id!;
    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [oldMemberId],
      },
    });
    const groupId = created.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    expect(status).toBe(200);
    const memberIds = data.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(newMemberId);
    expect(memberIds).not.toContain(oldMemberId);
  });

  test("POST /api/2.0/group/{id}/members - Group manager who is a regular user cannot replace members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const managerCreated = await apiSdk.addMember("owner", "User");
    const managerId = managerCreated.data.response!.id!;

    const { data: oldMember } = await apiSdk.addMember("owner", "User");
    const oldMemberId = oldMember.response!.id!;
    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: managerId,
        members: [oldMemberId],
      },
    });
    const groupId = created.response!.id!;

    const managerApi = await apiSdk.authenticateMember(
      managerCreated.userData,
      "User",
    );

    const { status } = await managerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });
    expect(status).toBe(403);
  });

  test("POST /api/2.0/group/{id}/members - Room admin cannot replace group members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { status } = await roomAdminApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });
    expect(status).toBe(403);
  });

  test("POST /api/2.0/group/{id}/members - User cannot replace group members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { status } = await userApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });
    expect(status).toBe(403);
  });

  test("POST /api/2.0/group/{id}/members - Guest cannot replace group members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { status } = await guestApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });
    expect(status).toBe(403);
  });

  test("POST /api/2.0/group/{id}/members - Anonymous cannot replace group members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await apiSdk.forAnonymous().groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });
    expect(status).toBe(401);
  });
});
