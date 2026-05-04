import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { faker } from "@faker-js/faker";

test.describe("POST /api/2.0/group - validation and edge cases", () => {
  // ❌ Required fields validation

  test.fail(
    "BUG 81417: POST /api/2.0/group - Owner cannot create group without groupName",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");
      const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
      const ownerId = ownerProfile.response!.id!;

      const { status } = await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupManager: ownerId,
        } as any,
      });

      expect(status).toBe(400);
    },
  );

  test("POST /api/2.0/group - Owner can create group without groupManager", async ({
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

  test.fail(
    "BUG 81418: POST /api/2.0/group - Owner cannot create group with empty groupName",
    async ({ apiSdk }) => {
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
    },
  );

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

  test.fail(
    "BUG 81419: POST /api/2.0/group - Owner cannot create group with non-existent groupManager",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.groupApi.addGroup({
        groupRequestDto: {
          groupName: apiSdk.faker.generateString(10),
          groupManager: faker.string.uuid(),
        },
      });

      expect(status).toBe(400);
    },
  );

  test.fail(
    "BUG 81420: POST /api/2.0/group - Owner cannot create group with non-existent user in members",
    async ({ apiSdk }) => {
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
    },
  );

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

  test.fail(
    "BUG 81421: POST /api/2.0/group - Owner cannot create group with spaces-only groupName",
    async ({ apiSdk }) => {
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
    },
  );

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
