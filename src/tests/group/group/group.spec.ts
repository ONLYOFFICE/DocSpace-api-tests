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
