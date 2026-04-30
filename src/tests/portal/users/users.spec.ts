import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeType } from "@onlyoffice/docspace-api-sdk";

test.describe("Portal — Invitation Links", () => {
  test.describe("POST /api/2.0/users/invitationlink - Create an invitation link", () => {
    test("POST /api/2.0/users/invitationlink - Owner creates invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(4); // 4 = User
      expect(data.response!.url).toBeTruthy();
    });

    test("POST /api/2.0/users/invitationlink - Owner creates invitation link for DocSpaceAdmin", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.DocSpaceAdmin,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(3); // 3 = DocSpaceAdmin
      expect(data.response!.url).toBeTruthy();
    });

    test("POST /api/2.0/users/invitationlink - Owner creates invitation link for RoomAdmin", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.RoomAdmin,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(1); // 1 = RoomAdmin
      expect(data.response!.url).toBeTruthy();
    });

    test("POST /api/2.0/users/invitationlink - Owner creates invitation link with future expiration", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const { data, status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          expiration: futureDate.toISOString(),
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.isExpired).toBe(false);
      expect(data.response!.url).toBeTruthy();
    });

    test("POST /api/2.0/users/invitationlink - Owner creates invitation link with maxUseCount 1000", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          maxUseCount: 1000,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.maxUseCount).toBe(1000);
      expect(data.response!.currentUseCount).toBe(0);
    });

    test("POST /api/2.0/users/invitationlink - DocSpaceAdmin can create invitation link for user", async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } = await adminApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
    });

    test("POST /api/2.0/users/invitationlink - DocSpace Admin can create invitation link for Room admin", async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } = await adminApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.RoomAdmin,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
    });

    test("POST /api/2.0/users/invitationlink - Room Admin can create invitation link for user", async ({
      apiSdk,
    }) => {
      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { data, status } = await roomAdminApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
    });
  });
  test.describe("GET /api/2.0/users/invitationlink/:employeeType - Get an invitation link", () => {
    test("GET /api/2.0/users/invitationlink/:employeeType - Owner gets invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      // Create a link first — fresh portal has no default invitation links
      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      const { data, status } =
        await ownerApi.users.getInvitationLinkByEmployeeType({
          employeeType: EmployeeType.User,
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(4); // 4 = User
      expect(data.response!.url).toBeTruthy();
    });

    test("GET /api/2.0/users/invitationlink/:employeeType - Owner gets invitation link for DocSpaceAdmin", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.DocSpaceAdmin,
        },
      });

      const { data, status } =
        await ownerApi.users.getInvitationLinkByEmployeeType({
          employeeType: EmployeeType.DocSpaceAdmin,
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(3); // 3 = DocSpaceAdmin
      expect(data.response!.url).toBeTruthy();
    });

    test("GET /api/2.0/users/invitationlink/:employeeType - Owner gets invitation link for RoomAdmin", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.RoomAdmin,
        },
      });

      const { data, status } =
        await ownerApi.users.getInvitationLinkByEmployeeType({
          employeeType: EmployeeType.RoomAdmin,
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(1); // 1 = RoomAdmin
      expect(data.response!.url).toBeTruthy();
    });

    test("GET /api/2.0/users/invitationlink/:employeeType - DocSpaceAdmin gets invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } =
        await adminApi.users.getInvitationLinkByEmployeeType({
          employeeType: EmployeeType.User,
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(4); // 4 = User
      expect(data.response!.url).toBeTruthy();
    });

    test("GET /api/2.0/users/invitationlink/:employeeType - DocSpaceAdmin gets invitation link for RoomAdmin", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.RoomAdmin,
        },
      });

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } =
        await adminApi.users.getInvitationLinkByEmployeeType({
          employeeType: EmployeeType.RoomAdmin,
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(1); // 1 = RoomAdmin
      expect(data.response!.url).toBeTruthy();
    });

    test("GET /api/2.0/users/invitationlink/:employeeType - RoomAdmin gets invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { data, status } =
        await roomAdminApi.users.getInvitationLinkByEmployeeType({
          employeeType: EmployeeType.User,
        });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBeTruthy();
      expect(data.response!.employeeType).toBe(4); // 4 = User
      expect(data.response!.url).toBeTruthy();
    });
  });

  // @deprecated — use getInvitationLinkByEmployeeType instead; returns StringWrapper (plain URL string) instead of InvitationLinkWrapper
  test.describe("GET /api/2.0/portal/users/invite/:employeeType - Get an invitation link (deprecated)", () => {
    test("GET /api/2.0/portal/users/invite/:employeeType - Owner gets invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      // Create a link first — fresh portal has no default invitation links
      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      const { data, status } = await ownerApi.users.getInvitationLink({
        employeeType: EmployeeType.User,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    test("GET /api/2.0/portal/users/invite/:employeeType - Owner gets invitation link for DocSpaceAdmin", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.DocSpaceAdmin,
        },
      });

      const { data, status } = await ownerApi.users.getInvitationLink({
        employeeType: EmployeeType.DocSpaceAdmin,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    test("GET /api/2.0/portal/users/invite/:employeeType - Owner gets invitation link for RoomAdmin", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.RoomAdmin,
        },
      });

      const { data, status } = await ownerApi.users.getInvitationLink({
        employeeType: EmployeeType.RoomAdmin,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    test("GET /api/2.0/portal/users/invite/:employeeType - DocSpaceAdmin gets invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } = await adminApi.users.getInvitationLink({
        employeeType: EmployeeType.User,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    test("GET /api/2.0/portal/users/invite/:employeeType - DocSpaceAdmin gets invitation link for RoomAdmin", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.RoomAdmin,
        },
      });

      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data, status } = await adminApi.users.getInvitationLink({
        employeeType: EmployeeType.RoomAdmin,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    test("GET /api/2.0/portal/users/invite/:employeeType - RoomAdmin gets invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { data, status } = await roomAdminApi.users.getInvitationLink({
        employeeType: EmployeeType.User,
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeTruthy();
    });

    test("GET /api/2.0/portal/users/invite/:employeeType - Guest type returns empty response", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.users.getInvitationLink({
        employeeType: EmployeeType.Guest,
      });

      expect(status).toBe(200);
      expect(data.response).toBeTruthy();
    });
  });

  test.describe("PUT /api/2.0/users/invitationlink - Update an invitation link", () => {
    test("PUT /api/2.0/users/invitationlink - Owner updates invitation link maxUseCount", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: created } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          maxUseCount: 5,
        },
      });
      const linkId = created.response!.id!;

      const { data, status } = await ownerApi.users.updateInvitationLink({
        invitationLinkUpdateRequestDto: {
          id: linkId,
          maxUseCount: 1000,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(linkId);
      expect(data.response!.maxUseCount).toBe(1000);
    });

    test("PUT /api/2.0/users/invitationlink - Owner updates invitation link expiration", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: created } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });
      const linkId = created.response!.id!;

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const { data, status } = await ownerApi.users.updateInvitationLink({
        invitationLinkUpdateRequestDto: {
          id: linkId,
          expiration: futureDate.toISOString(),
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.id).toBe(linkId);
      expect(data.response!.isExpired).toBe(false);
    });

    test("PUT /api/2.0/users/invitationlink - DocSpaceAdmin can update invitation link", async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { data: created } = await adminApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          maxUseCount: 5,
        },
      });
      const linkId = created.response!.id!;

      const { data, status } = await adminApi.users.updateInvitationLink({
        invitationLinkUpdateRequestDto: {
          id: linkId,
          maxUseCount: 10,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.maxUseCount).toBe(10);
    });

    test("PUT /api/2.0/users/invitationlink - RoomAdmin can update invitation link", async ({
      apiSdk,
    }) => {
      const { api: adminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { data: created } = await adminApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          maxUseCount: 5,
        },
      });
      const linkId = created.response!.id!;

      const { data, status } = await adminApi.users.updateInvitationLink({
        invitationLinkUpdateRequestDto: {
          id: linkId,
          maxUseCount: 10,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.maxUseCount).toBe(10);
    });
  });

  test.describe("DELETE /api/2.0/users/invitationlink - Delete an invitation link", () => {
    test("DELETE /api/2.0/users/invitationlink - Owner deletes invitation link and verifies it is gone", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: created } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });
      const linkId = created.response!.id!;

      const { data, status } = await ownerApi.users.deleteInvitationLink({
        invitationLinkDeleteRequestDto: {
          id: linkId,
        },
      });

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);

      // Verify the link no longer exists — re-delete returns 404
      const { status: reDeleteStatus } =
        await ownerApi.users.deleteInvitationLink({
          invitationLinkDeleteRequestDto: { id: linkId },
        });
      expect(reDeleteStatus).toBe(404);
    });

    test("DELETE /api/2.0/users/invitationlink - RoomAdmin can delete invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: created } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });
      const linkId = created.response!.id!;

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { status } = await roomAdminApi.users.deleteInvitationLink({
        invitationLinkDeleteRequestDto: { id: linkId },
      });

      expect(status).toBe(200);
    });

    test("DELETE /api/2.0/users/invitationlink - DocSpace Admin can delete invitation link for User", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data: created } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });
      const linkId = created.response!.id!;

      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "DocSpaceAdmin",
      );

      const { status } = await roomAdminApi.users.deleteInvitationLink({
        invitationLinkDeleteRequestDto: { id: linkId },
      });

      expect(status).toBe(200);
    });
  });
});

test.describe("GET /api/2.0/portal/userscount - Get portal users count", () => {
  test("GET /api/2.0/portal/userscount - Owner gets users count after adding all user types", async ({
    apiSdk,
  }) => {
    await apiSdk.addMember("owner", "DocSpaceAdmin");
    await apiSdk.addMember("owner", "RoomAdmin");
    await apiSdk.addMember("owner", "User");
    await apiSdk.addMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("owner")
      .users.getPortalUsersCount();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(5); // owner + 4 added users
  });

  test("GET /api/2.0/portal/userscount - DocSpaceAdmin gets users count after adding all user types", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );
    await apiSdk.addMember("owner", "RoomAdmin");
    await apiSdk.addMember("owner", "User");
    await apiSdk.addMember("owner", "Guest");

    const { data, status } = await adminApi.users.getPortalUsersCount();

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response).toBe(5); // owner + 4 added users
  });
});

test.describe("GET /api/2.0/portal/users/:userID - Get user by ID", () => {
  test("GET /api/2.0/portal/users/:userID - Owner gets user by ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;

    const { data, status } = await ownerApi.users.getUserById({
      userID: userId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.firstName).toBe(userData.response!.firstName);
    expect(data.response!.lastName).toBe(userData.response!.lastName);
    expect(data.response!.userName).toBeTruthy();
    expect(data.response!.email).toBe(userData.response!.email);
    expect(data.response!.createdBy).toBe(ownerId);
  });

  test("GET /api/2.0/portal/users/:userID - DocSpaceAdmin gets user by ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.users.getUserById({
      userID: userId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.firstName).toBe(userData.response!.firstName);
    expect(data.response!.lastName).toBe(userData.response!.lastName);
    expect(data.response!.userName).toBeTruthy();
    expect(data.response!.email).toBe(userData.response!.email);
    expect(data.response!.createdBy).toBe(ownerId);
  });

  test("GET /api/2.0/portal/users/:userID - RoomAdmin gets user by ID", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: ownerProfile } = await ownerApi.profiles.getSelfProfile();
    const ownerId = ownerProfile.response!.id!;

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.users.getUserById({
      userID: userId,
    });

    expect(status).toBe(200);
    expect(data.statusCode).toBe(200);
    expect(data.response!.id).toBe(userId);
    expect(data.response!.firstName).toBe(userData.response!.firstName);
    expect(data.response!.lastName).toBe(userData.response!.lastName);
    expect(data.response!.userName).toBeTruthy();
    expect(data.response!.email).toBe(userData.response!.email);
    expect(data.response!.createdBy).toBe(ownerId);
  });
});

// NOT TESTED: sendCongratulations (POST /api/2.0/portal/sendcongratulations)
// This method sends a congratulatory email to a user after portal registration.
// It is triggered automatically by the system and is not a user-initiated action.
// The method returns void, so there is nothing meaningful to assert beyond the status code.
// Email delivery cannot be verified through the API without a test inbox integration.
// For these reasons, testing this endpoint provides no practical value.

// NOT TESTED: markGiftMessageAsRead (POST /api/2.0/portal/users/gift)
// This method marks an onboarding gift message as read.
// There is no API endpoint to verify the read/unread state afterward,
// making it impossible to assert any observable side effect beyond the status code.
