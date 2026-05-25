import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { SortOrder } from "@onlyoffice/docspace-api-sdk";

test.describe("POST /api/2.0/group - Add a new group", () => {
  test("POST /api/2.0/group - Owner creates group with required fields only", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const groupName = apiSdk.faker.generateString(10);

    const { data, status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
      },
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBeDefined();
    expect(data.response?.name).toBe(groupName);
    expect(data.response?.manager?.id).toBe(ownerId);
  });

  test("POST /api/2.0/group - Owner creates group with members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: member1Data } = await apiSdk.addMember("owner", "User");
    const member1Id = member1Data.response!.id!;
    const { data: member2Data } = await apiSdk.addMember("owner", "User");
    const member2Id = member2Data.response!.id!;

    const { data, status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [member1Id, member2Id],
      },
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBeDefined();

    const groupId = data.response!.id!;
    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(member1Id);
    expect(memberIds).toContain(member2Id);
  });

  test("POST /api/2.0/group - Owner creates group with empty members list and manager is added as member", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data, status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [],
      },
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBeDefined();
    expect(data.response?.membersCount).toBe(1);
  });

  test("POST /api/2.0/group - Owner creates group with one member", async ({
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
        members: [memberId],
      },
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBeDefined();

    const groupId = data.response!.id!;
    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.members?.some((m) => m.id === memberId)).toBe(
      true,
    );
  });

  test("POST /api/2.0/group - Owner creates group with multiple members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: member1Data } = await apiSdk.addMember("owner", "User");
    const member1Id = member1Data.response!.id!;
    const { data: member2Data } = await apiSdk.addMember("owner", "User");
    const member2Id = member2Data.response!.id!;
    const { data: member3Data } = await apiSdk.addMember("owner", "User");
    const member3Id = member3Data.response!.id!;

    const { data, status } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [member1Id, member2Id, member3Id],
      },
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBeDefined();

    const groupId = data.response!.id!;
    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(member1Id);
    expect(memberIds).toContain(member2Id);
    expect(memberIds).toContain(member3Id);
  });
});

test.describe("GET /api/2.0/group - Get groups basic behavior", () => {
  test("GET /api/2.0/group - Returns 200 with array of groups", async ({
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

    const { data, status } = await ownerApi.groupApi.getGroups({});

    expect(status).toBe(200);
    expect(Array.isArray(data.response)).toBe(true);
  });

  test("GET /api/2.0/group - Each group in response contains id", async ({
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

    const { data } = await ownerApi.groupApi.getGroups({});

    for (const group of data.response!) {
      expect(group.id).toBeDefined();
    }
  });
});

test.describe("GET /api/2.0/group - Query params", () => {
  test("GET /api/2.0/group - filterValue filters groups by name", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const uniqueName = apiSdk.faker.generateString(20);

    await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName: uniqueName, groupManager: ownerId },
    });
    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { data, status } = await ownerApi.groupApi.getGroups({
      filterValue: uniqueName,
    });

    expect(status).toBe(200);
    expect(data.response?.length).toBe(1);
    expect(data.response![0].name).toBe(uniqueName);
  });

  test("GET /api/2.0/group - userId returns only groups where user is a member", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: g1 } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const group1Id = g1.response!.id!;

    const { data: g2 } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const group2Id = g2.response!.id!;

    const { data, status } = await ownerApi.groupApi.getGroups({
      userId: memberId,
    });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).toContain(group1Id);
    expect(ids).not.toContain(group2Id);
  });

  test("GET /api/2.0/group - manager=true returns only groups where user is manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newUserData } = await apiSdk.addMember("owner", "User");
    const userId = newUserData.response!.id!;

    const { data: mg } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: userId,
      },
    });
    const managerGroupId = mg.response!.id!;

    const { data: memg } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [userId],
      },
    });
    const memberGroupId = memg.response!.id!;

    const { data, status } = await ownerApi.groupApi.getGroups({
      userId,
      manager: true,
    });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).toContain(managerGroupId);
    expect(ids).not.toContain(memberGroupId);
  });

  test("GET /api/2.0/group - count limits number of returned groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const { data, status } = await ownerApi.groupApi.getGroups({ count: 2 });

    expect(status).toBe(200);
    expect(data.response?.length).toBe(2);
  });

  test("GET /api/2.0/group - startIndex offsets returned groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const { data: page1 } = await ownerApi.groupApi.getGroups({
      count: 1,
      startIndex: 0,
    });
    const { data: page2 } = await ownerApi.groupApi.getGroups({
      count: 1,
      startIndex: 1,
    });

    expect(page1.response![0].id).not.toBe(page2.response![0].id);
  });

  test("GET /api/2.0/group - sortOrder=Ascending sorts groups by name ascending", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const nameA = `A_${apiSdk.faker.generateString(8)}`;
    const nameZ = `Z_${apiSdk.faker.generateString(8)}`;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName: nameZ, groupManager: ownerId },
    });
    await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName: nameA, groupManager: ownerId },
    });

    const { data, status } = await ownerApi.groupApi.getGroups({
      sortBy: "Name",
      sortOrder: SortOrder.Ascending,
    });

    expect(status).toBe(200);
    const names = data.response!.map((g) => g.name!);
    expect(names.indexOf(nameA)).toBeLessThan(names.indexOf(nameZ));
  });

  test("GET /api/2.0/group - sortOrder=Descending sorts groups by name descending", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const nameA = `A_${apiSdk.faker.generateString(8)}`;
    const nameZ = `Z_${apiSdk.faker.generateString(8)}`;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName: nameA, groupManager: ownerId },
    });
    await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName: nameZ, groupManager: ownerId },
    });

    const { data, status } = await ownerApi.groupApi.getGroups({
      sortBy: "Name",
      sortOrder: SortOrder.Descending,
    });

    expect(status).toBe(200);
    const names = data.response!.map((g) => g.name!);
    expect(names.indexOf(nameZ)).toBeLessThan(names.indexOf(nameA));
  });
});

test.describe("GET /api/2.0/group - Filtering", () => {
  test("GET /api/2.0/group - userId returns only groups where user is a member", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data: g1 } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const memberGroupId = g1.response!.id!;

    const { data: g2 } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const otherGroupId = g2.response!.id!;

    const { data, status } = await ownerApi.groupApi.getGroups({
      userId: memberId,
    });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).toContain(memberGroupId);
    expect(ids).not.toContain(otherGroupId);
  });

  test("GET /api/2.0/group - manager=true returns only groups where user is manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { data: mg } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: userId,
      },
    });
    const managerGroupId = mg.response!.id!;

    const { data: memg } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [userId],
      },
    });
    const memberOnlyGroupId = memg.response!.id!;

    const { data, status } = await ownerApi.groupApi.getGroups({
      userId,
      manager: true,
    });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).toContain(managerGroupId);
    expect(ids).not.toContain(memberOnlyGroupId);
  });

  test("GET /api/2.0/group - filterValue filters by partial name match", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const uniquePart = apiSdk.faker.generateString(12);
    const fullName = `Prefix_${uniquePart}_Suffix`;

    const { data: g1 } = await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName: fullName, groupManager: ownerId },
    });
    const targetGroupId = g1.response!.id!;

    await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });

    const { data, status } = await ownerApi.groupApi.getGroups({
      filterValue: uniquePart,
    });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).toContain(targetGroupId);
  });

  test("GET /api/2.0/group - filterValue with no matches returns empty array", async ({
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

    const { data, status } = await ownerApi.groupApi.getGroups({
      filterValue: `NO_MATCH_${apiSdk.faker.generateString(20)}`,
    });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });
});

test.describe("GET /api/2.0/group - Pagination", () => {
  test("GET /api/2.0/group - count limits number of results", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    for (let i = 0; i < 5; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const { data, status } = await ownerApi.groupApi.getGroups({ count: 3 });

    expect(status).toBe(200);
    expect(data.response?.length).toBe(3);
  });

  test("GET /api/2.0/group - startIndex shifts results", async ({ apiSdk }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    for (let i = 0; i < 3; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const { data: withoutOffset } = await ownerApi.groupApi.getGroups({
      count: 2,
      startIndex: 0,
    });
    const { data: withOffset } = await ownerApi.groupApi.getGroups({
      count: 2,
      startIndex: 1,
    });

    const firstIds = withoutOffset.response!.map((g) => g.id);
    const secondIds = withOffset.response!.map((g) => g.id);
    expect(firstIds[0]).not.toBe(secondIds[0]);
    expect(firstIds[1]).toBe(secondIds[0]);
  });

  test("GET /api/2.0/group - count + startIndex produce no duplicates across pages", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    for (let i = 0; i < 4; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const { data: page1 } = await ownerApi.groupApi.getGroups({
      count: 2,
      startIndex: 0,
    });
    const { data: page2 } = await ownerApi.groupApi.getGroups({
      count: 2,
      startIndex: 2,
    });

    const page1Ids = page1.response!.map((g) => g.id);
    const page2Ids = page2.response!.map((g) => g.id);
    const overlap = page1Ids.filter((id) => page2Ids.includes(id));
    expect(overlap).toHaveLength(0);
  });

  test("GET /api/2.0/group - startIndex greater than total returns empty array", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    for (let i = 0; i < 2; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
        },
      });
    }

    const { data, status } = await ownerApi.groupApi.getGroups({
      startIndex: 100,
    });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });
});

test.describe("GET /api/2.0/group - Sorting", () => {
  test("GET /api/2.0/group - sortBy=Name sortOrder=Ascending returns groups in ascending order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const nameA = `A_${apiSdk.faker.generateString(8)}`;
    const nameM = `M_${apiSdk.faker.generateString(8)}`;
    const nameZ = `Z_${apiSdk.faker.generateString(8)}`;

    for (const name of [nameZ, nameA, nameM]) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: { groupName: name, groupManager: ownerId },
      });
    }

    const { data, status } = await ownerApi.groupApi.getGroups({
      sortBy: "Name",
      sortOrder: SortOrder.Ascending,
    });

    expect(status).toBe(200);
    const names = data.response!.map((g) => g.name!);
    for (let i = 0; i < names.length - 1; i++) {
      expect(names[i].localeCompare(names[i + 1])).toBeLessThanOrEqual(0);
    }
  });

  test("GET /api/2.0/group - sortBy=Name sortOrder=Descending returns groups in descending order", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const nameA = `A_${apiSdk.faker.generateString(8)}`;
    const nameM = `M_${apiSdk.faker.generateString(8)}`;
    const nameZ = `Z_${apiSdk.faker.generateString(8)}`;

    for (const name of [nameA, nameZ, nameM]) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: { groupName: name, groupManager: ownerId },
      });
    }

    const { data, status } = await ownerApi.groupApi.getGroups({
      sortBy: "Name",
      sortOrder: SortOrder.Descending,
    });

    expect(status).toBe(200);
    const names = data.response!.map((g) => g.name!);
    for (let i = 0; i < names.length - 1; i++) {
      expect(names[i].localeCompare(names[i + 1])).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe("PUT /api/2.0/group/{id} - Update a group", () => {
  test("PUT /api/2.0/group/{id} - Owner updates group name", async ({
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

    const newName = apiSdk.faker.generateString(10);
    const { data, status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { groupName: newName },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(newName);
  });

  test("PUT /api/2.0/group/{id} - Owner updates group manager", async ({
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

    const { data, status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { groupManager: newManagerId },
    });

    expect(status).toBe(200);
    expect(data.response?.manager?.id).toBe(newManagerId);
  });

  test("PUT /api/2.0/group/{id} - Owner adds members to group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: member1Data } = await apiSdk.addMember("owner", "User");
    const member1Id = member1Data.response!.id!;
    const { data: member2Data } = await apiSdk.addMember("owner", "User");
    const member2Id = member2Data.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { membersToAdd: [member1Id, member2Id] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(member1Id);
    expect(memberIds).toContain(member2Id);
  });

  test("PUT /api/2.0/group/{id} - Owner removes members from group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: member1Data } = await apiSdk.addMember("owner", "User");
    const member1Id = member1Data.response!.id!;
    const { data: member2Data } = await apiSdk.addMember("owner", "User");
    const member2Id = member2Data.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [member1Id, member2Id],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { membersToRemove: [member1Id] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id);
    expect(memberIds).not.toContain(member1Id);
    expect(memberIds).toContain(member2Id);
  });

  test("PUT /api/2.0/group/{id} - Owner updates multiple fields at once", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberToRemoveData } = await apiSdk.addMember(
      "owner",
      "User",
    );
    const memberToRemoveId = memberToRemoveData.response!.id!;
    const { data: memberToAddData } = await apiSdk.addMember("owner", "User");
    const memberToAddId = memberToAddData.response!.id!;
    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [memberToRemoveId],
      },
    });
    const groupId = created.response!.id!;

    const newName = apiSdk.faker.generateString(10);
    const { data, status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: {
        groupName: newName,
        groupManager: newManagerId,
        membersToAdd: [memberToAddId],
        membersToRemove: [memberToRemoveId],
      },
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(newName);
    expect(data.response?.manager?.id).toBe(newManagerId);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(memberToAddId);
    expect(memberIds).not.toContain(memberToRemoveId);
  });

  test("PUT /api/2.0/group/{id} - Empty update body returns 200 and group is unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const originalName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: originalName,
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: {},
    });

    expect(status).toBe(200);
    expect(data.response?.name).toBe(originalName);
    expect(data.response?.manager?.id).toBe(ownerId);
  });
});

test.describe("PUT /api/2.0/group/{id}/members - Add group members", () => {
  test("PUT /api/2.0/group/{id}/members - Owner adds one user to group", async ({
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

    const { data, status } = await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    expect(status).toBe(200);
    const memberIds = data.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(memberId);
  });

  test("PUT /api/2.0/group/{id}/members - Owner adds multiple users to group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;
    const { data: m3 } = await apiSdk.addMember("owner", "User");
    const m3Id = m3.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [m1Id, m2Id, m3Id] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(m1Id);
    expect(memberIds).toContain(m2Id);
    expect(memberIds).toContain(m3Id);
  });

  test("PUT /api/2.0/group/{id}/members - Adding new members keeps existing members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: existing } = await apiSdk.addMember("owner", "User");
    const existingId = existing.response!.id!;
    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [existingId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(existingId);
    expect(memberIds).toContain(newMemberId);
  });

  test("PUT /api/2.0/group/{id}/members - membersCount increases after adding users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [m1Id, m2Id] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount + 2);
  });

  test("PUT /api/2.0/group/{id}/members - Adding the same user twice does not duplicate the member", async ({
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

    await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    const { status } = await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const occurrences = groupData.response?.members?.filter(
      (m) => m.id === memberId,
    ).length;
    expect(occurrences).toBe(1);
  });

  test("PUT /api/2.0/group/{id}/members - Returns updated group with added members in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName, groupManager: ownerId },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(groupId);
    expect(data.response?.name).toBe(groupName);
    expect(data.response?.manager?.id).toBe(ownerId);
    const memberIds = data.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(memberId);
  });

  test("PUT /api/2.0/group/{id}/members - Added members persist after re-fetching the group", async ({
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

    await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    const { data: first } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const { data: second } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });

    expect(first.response?.members?.map((m) => m.id)).toContain(memberId);
    expect(second.response?.members?.map((m) => m.id)).toContain(memberId);
  });
});

test.describe("GET /api/2.0/group/{id} - Get a group", () => {
  test("GET /api/2.0/group/{id} - Owner gets group by valid id without includeMembers and members list is returned by default", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.getGroup({ id: groupId });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(groupId);
    expect(data.response?.name).toBe(groupName);
    expect(data.response?.members).toBeDefined();
    const memberIds = data.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(memberId);
  });

  test("GET /api/2.0/group/{id} - Owner gets group by valid id with includeMembers = true", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: member1Data } = await apiSdk.addMember("owner", "User");
    const member1Id = member1Data.response!.id!;
    const { data: member2Data } = await apiSdk.addMember("owner", "User");
    const member2Id = member2Data.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
        members: [member1Id, member2Id],
      },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(groupId);
    expect(data.response?.members).toBeDefined();
    const memberIds = data.response?.members?.map((m) => m.id);
    expect(memberIds).toContain(member1Id);
    expect(memberIds).toContain(member2Id);
  });

  test("GET /api/2.0/group/{id} - Owner gets group by valid id with includeMembers = false", async ({
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

    const { data, status } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: false,
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(groupId);
    expect(data.response?.members).toBeFalsy();
  });

  test("GET /api/2.0/group/{id} - getGroup is idempotent", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { data: first } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const { data: second } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });

    expect(second.response?.id).toBe(first.response?.id);
    expect(second.response?.name).toBe(first.response?.name);
    expect(second.response?.manager?.id).toBe(first.response?.manager?.id);

    const firstMemberIds = first.response?.members?.map((m) => m.id).sort();
    const secondMemberIds = second.response?.members?.map((m) => m.id).sort();
    expect(secondMemberIds).toEqual(firstMemberIds);
  });
});

test.describe("GET /api/2.0/group/user/{userid} - Get user groups", () => {
  test("GET /api/2.0/group/user/{userid} - Returns groups where user is a member", async ({
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

    const { data, status } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id);
    expect(ids).toContain(groupId);
  });

  test("GET /api/2.0/group/user/{userid} - Returns multiple groups for one user", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const groupIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { data: g } = await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
          members: [memberId],
        },
      });
      groupIds.push(g.response!.id!);
    }

    const { data, status } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id) ?? [];
    for (const groupId of groupIds) {
      expect(ids).toContain(groupId);
    }
  });

  test("GET /api/2.0/group/user/{userid} - Returns empty array if user has no groups", async ({
    apiSdk,
  }) => {
    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const { data, status } = await apiSdk
      .forRole("owner")
      .groupApi.getGroupByUserId({ userid: memberId });

    expect(status).toBe(200);
    expect(data.response).toEqual([]);
  });

  test("GET /api/2.0/group/user/{userid} - Response items contain group summary fields", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });

    expect(status).toBe(200);
    const summary = data.response?.find((g) => g.id === groupId);
    expect(summary).toBeDefined();
    expect(summary?.id).toBe(groupId);
    expect(summary?.name).toBe(groupName);
  });

  test("GET /api/2.0/group/user/{userid} - Result updates after adding user to group", async ({
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

    const { data: before } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });
    expect(before.response?.map((g) => g.id)).not.toContain(groupId);

    await ownerApi.groupApi.addMembersTo({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    const { data: after, status } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });
    expect(status).toBe(200);
    expect(after.response?.map((g) => g.id)).toContain(groupId);
  });

  test("GET /api/2.0/group/user/{userid} - Result updates after removing user from group", async ({
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

    const { data: before } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });
    expect(before.response?.map((g) => g.id)).toContain(groupId);

    await ownerApi.groupApi.updateGroup({
      id: groupId,
      updateGroupRequest: { membersToRemove: [memberId] },
    });

    const { data: after, status } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });
    expect(status).toBe(200);
    expect(after.response?.map((g) => g.id)).not.toContain(groupId);
  });

  test("GET /api/2.0/group/user/{userid} - Returns same groups as getGroups filtered by userId", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    for (let i = 0; i < 2; i++) {
      await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: ownerId,
          members: [memberId],
        },
      });
    }

    const { data: byUser } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });
    const { data: filtered } = await ownerApi.groupApi.getGroups({
      userId: memberId,
    });

    const byUserIds = byUser.response?.map((g) => g.id).sort() ?? [];
    const filteredIds = filtered.response?.map((g) => g.id).sort() ?? [];
    expect(byUserIds).toEqual(filteredIds);
  });
});

test.describe("DELETE /api/2.0/group/{id} - Delete a group", () => {
  test("DELETE /api/2.0/group/{id} - Owner deletes an existing group", async ({
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

    const { status } = await ownerApi.groupApi.deleteGroup({ id: groupId });

    expect(status).toBe(204);
  });

  test("DELETE /api/2.0/group/{id} - Deleted group is no longer available via getGroup", async ({
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

    const { status } = await ownerApi.groupApi.getGroup({ id: groupId });

    expect(status).toBe(404);
  });

  test("DELETE /api/2.0/group/{id} - Deleted group disappears from groups list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName, groupManager: ownerId },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.deleteGroup({ id: groupId });

    const { data, status } = await ownerApi.groupApi.getGroups({
      filterValue: groupName,
    });

    expect(status).toBe(200);
    const ids = data.response?.map((g) => g.id) ?? [];
    expect(ids).not.toContain(groupId);
  });
});

test.describe("PUT /api/2.0/group/{fromId}/members/{toId} - Move group members", () => {
  test("BUG 81497: PUT /api/2.0/group/{fromId}/members/{toId} - Owner moves one member from source to target", async ({
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

    const { status } = await ownerApi.groupApi.moveMembersTo({
      fromId,
      toId,
    });
    expect(status).toBe(200);

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const targetIds = targetAfter.response?.members?.map((m) => m.id) ?? [];
    expect(targetIds).toContain(memberId);

    const { data: sourceAfter } = await ownerApi.groupApi.getGroup({
      id: fromId,
      includeMembers: true,
    });
    const sourceIds = sourceAfter.response?.members?.map((m) => m.id) ?? [];
    expect(sourceIds).not.toContain(memberId);
  });

  test("BUG 81497: PUT /api/2.0/group/{fromId}/members/{toId} - Owner moves multiple members from source to target", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;
    const { data: m3 } = await apiSdk.addMember("owner", "User");
    const m3Id = m3.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [m1Id, m2Id, m3Id],
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

    const { status } = await ownerApi.groupApi.moveMembersTo({
      fromId,
      toId,
    });
    expect(status).toBe(200);

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const targetIds = targetAfter.response?.members?.map((m) => m.id) ?? [];
    expect(targetIds).toContain(m1Id);
    expect(targetIds).toContain(m2Id);
    expect(targetIds).toContain(m3Id);

    const { data: sourceAfter } = await ownerApi.groupApi.getGroup({
      id: fromId,
      includeMembers: true,
    });
    const sourceIds = sourceAfter.response?.members?.map((m) => m.id) ?? [];
    expect(sourceIds).not.toContain(m1Id);
    expect(sourceIds).not.toContain(m2Id);
    expect(sourceIds).not.toContain(m3Id);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Moving members preserves existing target group members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: srcMember } = await apiSdk.addMember("owner", "User");
    const srcMemberId = srcMember.response!.id!;
    const { data: tgtMember } = await apiSdk.addMember("owner", "User");
    const tgtMemberId = tgtMember.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [srcMemberId],
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [tgtMemberId],
      },
    });
    const toId = target.response!.id!;

    const { status } = await ownerApi.groupApi.moveMembersTo({ fromId, toId });
    expect(status).toBe(200);

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const targetIds = targetAfter.response?.members?.map((m) => m.id) ?? [];
    expect(targetIds).toContain(tgtMemberId);
    expect(targetIds).toContain(srcMemberId);
  });

  test("BUG 81497: PUT /api/2.0/group/{fromId}/members/{toId} - Moving overlapping members does not duplicate them in target", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: shared } = await apiSdk.addMember("owner", "User");
    const sharedId = shared.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [sharedId],
      },
    });
    const fromId = source.response!.id!;

    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [sharedId],
      },
    });
    const toId = target.response!.id!;

    const { status } = await ownerApi.groupApi.moveMembersTo({
      fromId,
      toId,
    });
    expect(status).toBe(200);

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const occurrences = targetAfter.response?.members?.filter(
      (m) => m.id === sharedId,
    ).length;
    expect(occurrences).toBe(1);

    const { data: sourceAfter } = await ownerApi.groupApi.getGroup({
      id: fromId,
      includeMembers: true,
    });
    const sourceIds = sourceAfter.response?.members?.map((m) => m.id) ?? [];
    expect(sourceIds).not.toContain(sharedId);
  });

  test("BUG 81497: PUT /api/2.0/group/{fromId}/members/{toId} - Source group has no moved members after move", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [m1Id, m2Id],
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

    const { data: sourceAfter } = await ownerApi.groupApi.getGroup({
      id: fromId,
      includeMembers: true,
    });
    const sourceIds = sourceAfter.response?.members?.map((m) => m.id) ?? [];
    expect(sourceIds).not.toContain(m1Id);
    expect(sourceIds).not.toContain(m2Id);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Returns updated target group with moved members in response", async ({
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

    const targetName = apiSdk.faker.generateString(10);
    const { data: target } = await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName: targetName, groupManager: ownerId },
    });
    const toId = target.response!.id!;

    const { data, status } = await ownerApi.groupApi.moveMembersTo({
      fromId,
      toId,
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(toId);
    expect(data.response?.name).toBe(targetName);
    const memberIds = data.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(memberId);
  });

  test("BUG 81497: PUT /api/2.0/group/{fromId}/members/{toId} - Changes persist after re-fetching both groups", async ({
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

    await ownerApi.groupApi.moveMembersTo({ fromId, toId });

    const { data: targetFirst } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const { data: targetSecond } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    expect(targetFirst.response?.members?.map((m) => m.id)).toContain(memberId);
    expect(targetSecond.response?.members?.map((m) => m.id)).toContain(
      memberId,
    );

    const { data: sourceFirst } = await ownerApi.groupApi.getGroup({
      id: fromId,
      includeMembers: true,
    });
    const { data: sourceSecond } = await ownerApi.groupApi.getGroup({
      id: fromId,
      includeMembers: true,
    });
    expect(sourceFirst.response?.members?.map((m) => m.id)).not.toContain(
      memberId,
    );
    expect(sourceSecond.response?.members?.map((m) => m.id)).not.toContain(
      memberId,
    );
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Move from empty source group leaves target unchanged", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: tgtMember } = await apiSdk.addMember("owner", "User");
    const tgtMemberId = tgtMember.response!.id!;

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
        members: [tgtMemberId],
      },
    });
    const toId = target.response!.id!;

    const { data: targetBefore } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const idsBefore = (targetBefore.response?.members?.map((m) => m.id) ?? [])
      .slice()
      .sort();
    const countBefore = targetBefore.response?.membersCount;

    const { status } = await ownerApi.groupApi.moveMembersTo({ fromId, toId });
    expect(status).toBeLessThan(500);

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const idsAfter = (targetAfter.response?.members?.map((m) => m.id) ?? [])
      .slice()
      .sort();
    expect(idsAfter).toEqual(idsBefore);
    expect(targetAfter.response?.membersCount).toBe(countBefore);
  });

  test("BUG 81497: PUT /api/2.0/group/{fromId}/members/{toId} - Member counts update correctly in both groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;

    const { data: source } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [m1Id, m2Id],
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
    const targetCountBefore = target.response!.membersCount!;

    await ownerApi.groupApi.moveMembersTo({ fromId, toId });

    const { data: sourceAfter } = await ownerApi.groupApi.getGroup({
      id: fromId,
      includeMembers: true,
    });
    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });

    expect(sourceAfter.response?.membersCount).toBe(0);
    expect(targetAfter.response?.membersCount).toBe(targetCountBefore + 2);
  });

  test("PUT /api/2.0/group/{fromId}/members/{toId} - Repeated move with same fromId and toId is idempotent", async ({
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

    await ownerApi.groupApi.moveMembersTo({ fromId, toId });
    const { status } = await ownerApi.groupApi.moveMembersTo({ fromId, toId });
    expect(status).toBeLessThan(500);

    const { data: targetAfter } = await ownerApi.groupApi.getGroup({
      id: toId,
      includeMembers: true,
    });
    const occurrences = targetAfter.response?.members?.filter(
      (m) => m.id === memberId,
    ).length;
    expect(occurrences).toBe(1);
  });
});

test.describe("DELETE /api/2.0/group/{id}/members - Remove group members", () => {
  test("DELETE /api/2.0/group/{id}/members - Owner removes one member from group", async ({
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

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - Owner removes multiple members from group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;
    const { data: m3 } = await apiSdk.addMember("owner", "User");
    const m3Id = m3.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [m1Id, m2Id, m3Id],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [m1Id, m2Id, m3Id] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(m1Id);
    expect(memberIds).not.toContain(m2Id);
    expect(memberIds).not.toContain(m3Id);
  });

  test("DELETE /api/2.0/group/{id}/members - Other existing members are kept after removing selected users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: keep } = await apiSdk.addMember("owner", "User");
    const keepId = keep.response!.id!;
    const { data: remove } = await apiSdk.addMember("owner", "User");
    const removeId = remove.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [keepId, removeId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [removeId] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(keepId);
    expect(memberIds).not.toContain(removeId);
  });

  test("DELETE /api/2.0/group/{id}/members - Returns updated group in response", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(groupId);
    expect(data.response?.name).toBe(groupName);
    expect(data.response?.manager?.id).toBe(ownerId);
    const memberIds = data.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - membersCount decreases after removing users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [m1Id, m2Id],
      },
    });
    const groupId = created.response!.id!;
    const initialCount = created.response!.membersCount!;

    await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [m1Id, m2Id] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.membersCount).toBe(initialCount - 2);
  });

  test("DELETE /api/2.0/group/{id}/members - Removed members persist after re-fetching the group", async ({
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

    await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    const { data: first } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const { data: second } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });

    expect(first.response?.members?.map((m) => m.id) ?? []).not.toContain(
      memberId,
    );
    expect(second.response?.members?.map((m) => m.id) ?? []).not.toContain(
      memberId,
    );
  });

  test("DELETE /api/2.0/group/{id}/members - Removed user is not deleted from portal", async ({
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

    await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    const { data: profile, status } =
      await ownerApi.profiles.getProfileByUserId({ userid: memberId });
    expect(status).toBe(200);
    expect(profile.response?.id).toBe(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - Owner can remove all members from group", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [m1Id, m2Id],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [m1Id, m2Id] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(groupData.response?.id).toBe(groupId);
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(m1Id);
    expect(memberIds).not.toContain(m2Id);
  });

  test("DELETE /api/2.0/group/{id}/members - Owner removes the only member from group", async ({
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

    const { status } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(memberId);
  });

  test("DELETE /api/2.0/group/{id}/members - Removed user disappears from getGroup with includeMembers=true", async ({
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

    const { data: before } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(before.response?.members?.map((m) => m.id) ?? []).toContain(
      memberId,
    );

    await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    const { data: after } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    expect(after.response?.members?.map((m) => m.id) ?? []).not.toContain(
      memberId,
    );
  });

  test("DELETE /api/2.0/group/{id}/members - Removed user no longer has the group in getGroupByUserId", async ({
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

    const { data: before } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });
    expect(before.response?.map((g) => g.id) ?? []).toContain(groupId);

    await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    const { data: after, status } = await ownerApi.groupApi.getGroupByUserId({
      userid: memberId,
    });
    expect(status).toBe(200);
    expect(after.response?.map((g) => g.id) ?? []).not.toContain(groupId);
  });

  test("DELETE /api/2.0/group/{id}/members - Group name is preserved after removing members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
    });
    expect(groupData.response?.name).toBe(groupName);
  });

  test("DELETE /api/2.0/group/{id}/members - Group manager is preserved after removing members", async ({
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

    await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
    });
    expect(groupData.response?.manager?.id).toBe(ownerId);
  });

  test("DELETE /api/2.0/group/{id}/members - Removing members from one group does not affect unrelated groups", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: shared } = await apiSdk.addMember("owner", "User");
    const sharedId = shared.response!.id!;

    const { data: groupA } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [sharedId],
      },
    });
    const groupAId = groupA.response!.id!;

    const { data: groupB } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [sharedId],
      },
    });
    const groupBId = groupB.response!.id!;

    await ownerApi.groupApi.removeMembersFrom({
      id: groupAId,
      membersRequest: { members: [sharedId] },
    });

    const { data: groupBData } = await ownerApi.groupApi.getGroup({
      id: groupBId,
      includeMembers: true,
    });
    const memberIds = groupBData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(sharedId);
  });

  test("DELETE /api/2.0/group/{id}/members - Removing the same member twice is idempotent", async ({
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

    const { status: firstStatus } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(firstStatus).toBe(200);

    const { status: secondStatus } = await ownerApi.groupApi.removeMembersFrom({
      id: groupId,
      membersRequest: { members: [memberId] },
    });
    expect(secondStatus).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(memberId);
  });
});

test.describe("PUT /api/2.0/group/{id}/manager - Set a group manager", () => {
  test("PUT /api/2.0/group/{id}/manager - Owner sets a new group manager", async ({
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

    const { data, status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    expect(status).toBe(200);
    expect(data.response?.manager?.id).toBe(newManagerId);
  });

  test("PUT /api/2.0/group/{id}/manager - Replaces existing manager", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: managerA } = await apiSdk.addMember("owner", "User");
    const managerAId = managerA.response!.id!;
    const { data: managerB } = await apiSdk.addMember("owner", "User");
    const managerBId = managerB.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: managerAId,
      },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: managerBId },
    });

    expect(status).toBe(200);
    expect(data.response?.manager?.id).toBe(managerBId);
    expect(data.response?.manager?.id).not.toBe(managerAId);
  });

  test("PUT /api/2.0/group/{id}/manager - Group name is not changed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const originalName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: originalName,
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
    });
    expect(groupData.response?.name).toBe(originalName);
  });

  test("PUT /api/2.0/group/{id}/manager - Existing members are preserved and the new manager is added as a member", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: m1 } = await apiSdk.addMember("owner", "User");
    const m1Id = m1.response!.id!;
    const { data: m2 } = await apiSdk.addMember("owner", "User");
    const m2Id = m2.response!.id!;
    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [m1Id, m2Id],
      },
    });
    const groupId = created.response!.id!;

    const { data: before } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const membersBefore = before.response?.members?.map((m) => m.id) ?? [];

    await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    const { data: after } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const membersAfter = after.response?.members?.map((m) => m.id) ?? [];

    for (const id of membersBefore) {
      expect(membersAfter).toContain(id);
    }
    expect(membersAfter).toContain(newManagerId);
  });

  test("PUT /api/2.0/group/{id}/manager - Sets manager to existing group member", async ({
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

    const { data, status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: memberId },
    });

    expect(status).toBe(200);
    expect(data.response?.manager?.id).toBe(memberId);
  });

  test("PUT /api/2.0/group/{id}/manager - Sets manager to user who is not a group member", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: outsiderData } = await apiSdk.addMember("owner", "User");
    const outsiderId = outsiderData.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
      },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: outsiderId },
    });

    expect(status).toBe(200);
    expect(data.response?.manager?.id).toBe(outsiderId);
  });

  test("PUT /api/2.0/group/{id}/manager - Manager change persists after re-fetching the group", async ({
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

    await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
    });
    expect(groupData.response?.manager?.id).toBe(newManagerId);
  });

  test("PUT /api/2.0/group/{id}/manager - Setting the current manager again is idempotent", async ({
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

    const { data, status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: ownerId },
    });

    expect(status).toBe(200);
    expect(data.response?.manager?.id).toBe(ownerId);
  });

  test("PUT /api/2.0/group/{id}/manager - Updates manager and adds them to members, leaves id, name and existing members intact", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: memberData } = await apiSdk.addMember("owner", "User");
    const memberId = memberData.response!.id!;
    const { data: newManagerData } = await apiSdk.addMember("owner", "User");
    const newManagerId = newManagerData.response!.id!;

    const originalName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: originalName,
        groupManager: ownerId,
        members: [memberId],
      },
    });
    const groupId = created.response!.id!;

    const { data: before } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const membersBefore = before.response?.members?.map((m) => m.id) ?? [];

    await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    const { data: after } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const membersAfter = after.response?.members?.map((m) => m.id) ?? [];

    expect(after.response?.id).toBe(groupId);
    expect(after.response?.name).toBe(originalName);
    expect(after.response?.manager?.id).toBe(newManagerId);
    for (const id of membersBefore) {
      expect(membersAfter).toContain(id);
    }
    expect(membersAfter).toContain(newManagerId);
  });

  test("PUT /api/2.0/group/{id}/manager - Returns GroupWrapper with correct structure", async ({
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

    const { data, status } = await ownerApi.groupApi.setGroupManager({
      id: groupId,
      setManagerRequest: { userId: newManagerId },
    });

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(data.response?.id).toBe(groupId);
    expect(data.response?.manager?.id).toBe(newManagerId);
  });
});

test.describe("POST /api/2.0/group/{id}/members - Replace group members", () => {
  test("POST /api/2.0/group/{id}/members - Owner replaces existing members with one new user", async ({
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

    const { data, status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    expect(status).toBe(200);
    const memberIds = data.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(newMemberId);
  });

  test("POST /api/2.0/group/{id}/members - Owner replaces existing members with multiple new users", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: oldMember } = await apiSdk.addMember("owner", "User");
    const oldMemberId = oldMember.response!.id!;
    const { data: n1 } = await apiSdk.addMember("owner", "User");
    const n1Id = n1.response!.id!;
    const { data: n2 } = await apiSdk.addMember("owner", "User");
    const n2Id = n2.response!.id!;
    const { data: n3 } = await apiSdk.addMember("owner", "User");
    const n3Id = n3.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [oldMemberId],
      },
    });
    const groupId = created.response!.id!;

    const { status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [n1Id, n2Id, n3Id] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(n1Id);
    expect(memberIds).toContain(n2Id);
    expect(memberIds).toContain(n3Id);
  });

  test("POST /api/2.0/group/{id}/members - Old members not in new list are removed", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: oldA } = await apiSdk.addMember("owner", "User");
    const oldAId = oldA.response!.id!;
    const { data: oldB } = await apiSdk.addMember("owner", "User");
    const oldBId = oldB.response!.id!;
    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [oldAId, oldBId],
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(oldAId);
    expect(memberIds).not.toContain(oldBId);
  });

  test("POST /api/2.0/group/{id}/members - Final members contain only users from membersRequest (plus manager)", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: oldMember } = await apiSdk.addMember("owner", "User");
    const oldMemberId = oldMember.response!.id!;
    const { data: n1 } = await apiSdk.addMember("owner", "User");
    const n1Id = n1.response!.id!;
    const { data: n2 } = await apiSdk.addMember("owner", "User");
    const n2Id = n2.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [oldMemberId],
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [n1Id, n2Id] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    const expectedSet = new Set([n1Id, n2Id, ownerId]);
    for (const id of memberIds) {
      expect(expectedSet.has(id!)).toBe(true);
    }
    expect(memberIds).not.toContain(oldMemberId);
  });

  test("POST /api/2.0/group/{id}/members - Returns updated GroupWrapper with id, name and new members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: { groupName, groupManager: ownerId },
    });
    const groupId = created.response!.id!;

    const { data, status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    expect(status).toBe(200);
    expect(data.response?.id).toBe(groupId);
    expect(data.response?.name).toBe(groupName);
    const memberIds = data.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(newMemberId);
  });

  test("POST /api/2.0/group/{id}/members - Replaced members persist after re-fetching the group", async ({
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

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    const { data: first } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const { data: second } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const firstIds = first.response?.members?.map((m) => m.id) ?? [];
    const secondIds = second.response?.members?.map((m) => m.id) ?? [];
    expect(firstIds).toContain(newMemberId);
    expect(firstIds).not.toContain(oldMemberId);
    expect(secondIds).toContain(newMemberId);
    expect(secondIds).not.toContain(oldMemberId);
  });

  test("POST /api/2.0/group/{id}/members - Same userId passed twice does not create a duplicate member", async ({
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

    const { status } = await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [memberId, memberId] },
    });
    expect(status).toBe(200);

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const occurrences =
      groupData.response?.members?.filter((m) => m.id === memberId).length ?? 0;
    expect(occurrences).toBe(1);
  });

  test("POST /api/2.0/group/{id}/members - Group name is preserved after replacing members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: oldMember } = await apiSdk.addMember("owner", "User");
    const oldMemberId = oldMember.response!.id!;
    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const groupName = apiSdk.faker.generateString(10);
    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName,
        groupManager: ownerId,
        members: [oldMemberId],
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
    });
    expect(groupData.response?.name).toBe(groupName);
  });

  test("POST /api/2.0/group/{id}/members - Group manager is removed when not in new members list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: managerData } = await apiSdk.addMember("owner", "User");
    const managerId = managerData.response!.id!;
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

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
    });
    expect(groupData.response?.manager?.id).toBeUndefined();
  });

  test("POST /api/2.0/group/{id}/members - Manager is removed from members and group.manager becomes undefined when not in new members list", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: managerData } = await apiSdk.addMember("owner", "User");
    const managerId = managerData.response!.id!;
    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: managerId,
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).not.toContain(managerId);
    expect(memberIds).toContain(newMemberId);
    expect(groupData.response?.manager?.id).toBeUndefined();
  });

  test("POST /api/2.0/group/{id}/members - Manager stays in members list when passed in members explicitly", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: managerData } = await apiSdk.addMember("owner", "User");
    const managerId = managerData.response!.id!;
    const { data: newMember } = await apiSdk.addMember("owner", "User");
    const newMemberId = newMember.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: managerId,
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [managerId, newMemberId] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    const managerOccurrences = memberIds.filter(
      (id) => id === managerId,
    ).length;
    expect(memberIds).toContain(managerId);
    expect(memberIds).toContain(newMemberId);
    expect(managerOccurrences).toBe(1);
  });

  test("POST /api/2.0/group/{id}/members - Mix of existing and new members results in exactly those members", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: keep } = await apiSdk.addMember("owner", "User");
    const keepId = keep.response!.id!;
    const { data: drop } = await apiSdk.addMember("owner", "User");
    const dropId = drop.response!.id!;
    const { data: add } = await apiSdk.addMember("owner", "User");
    const addId = add.response!.id!;

    const { data: created } = await ownerApi.groupApi.addGroup({
      groupRequestDto: {
        groupName: apiSdk.faker.generateString(10),
        groupManager: ownerId,
        members: [keepId, dropId],
      },
    });
    const groupId = created.response!.id!;

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [keepId, addId] },
    });

    const { data: groupData } = await ownerApi.groupApi.getGroup({
      id: groupId,
      includeMembers: true,
    });
    const memberIds = groupData.response?.members?.map((m) => m.id) ?? [];
    expect(memberIds).toContain(keepId);
    expect(memberIds).toContain(addId);
    expect(memberIds).not.toContain(dropId);
  });

  test("POST /api/2.0/group/{id}/members - Replaced users remain in the portal", async ({
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

    await ownerApi.groupApi.setMembersTo({
      id: groupId,
      membersRequest: { members: [newMemberId] },
    });

    const { data: profile, status } =
      await ownerApi.profiles.getProfileByUserId({ userid: oldMemberId });
    expect(status).toBe(200);
    expect(profile.response?.id).toBe(oldMemberId);
  });
});
