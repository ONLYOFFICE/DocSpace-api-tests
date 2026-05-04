import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

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
