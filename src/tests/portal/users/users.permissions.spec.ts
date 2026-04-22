import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeType } from "@onlyoffice/docspace-api-sdk";

test.describe("Portal — Invitation Links (permissions)", () => {
  test.describe("POST /api/2.0/users/invitationlink - access control", () => {
    test("POST /api/2.0/users/invitationlink - Owner cannot create invitation link for Guest", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.Guest,
        },
      });

      expect(status).toBe(400);
      expect((data as any).error.message).toBe("EmployeeType");
    });

    test("POST /api/2.0/users/invitationlink - Owner cannot create invitation link with maxUseCount above 1000", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          maxUseCount: 1001,
        },
      });
      console.log(data);
      expect(status).toBe(400);
    });

    test("POST /api/2.0/users/invitationlink - Owner cannot create invitation link with past expiration", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const { status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          expiration: pastDate.toISOString(),
        },
      });

      expect(status).toBe(400);
    });
  });

  test("POST /api/2.0/users/invitationlink - Anonymous cannot create invitation link", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.User,
      },
    });

    expect(status).toBe(401);
  });

  test("POST /api/2.0/users/invitationlink - DocSpace Admin can't create invitation link for DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/users/invitationlink - DocSpace Admin can't create invitation link for Guest", async ({
    apiSdk,
  }) => {
    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.Guest,
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe("EmployeeType");
  });

  test("POST /api/2.0/users/invitationlink - Room Admin cannot create invitation link for DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/users/invitationlink - RoomAdmin cannot create invitation link for RoomAdmin", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.RoomAdmin,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/users/invitationlink - RoomAdmin cannot create invitation link for Guest", async ({
    apiSdk,
  }) => {
    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.Guest,
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe("EmployeeType");
  });

  test("POST /api/2.0/users/invitationlink - User cannot create invitation link", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.User,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/users/invitationlink - User cannot create invitation link for Guest", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.Guest,
      },
    });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe("EmployeeType");
  });

  test("POST /api/2.0/users/invitationlink - Guest cannot create invitation link for User", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.User,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/users/invitationlink - Guest cannot create invitation link for Room admin", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.RoomAdmin,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("POST /api/2.0/users/invitationlink - Guest cannot create invitation link for DocSpace admin", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/users/invitationlink/:employeeType - access control", () => {
  test("GET /api/2.0/users/invitationlink/:employeeType - Anonymous cannot get invitation link", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.users.getInvitationLinkByEmployeeType({
      employeeType: EmployeeType.User,
    });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/users/invitationlink/:employeeType - DocSpaceAdmin can't get invitation link for DocSpace admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } =
      await adminApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.DocSpaceAdmin,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/users/invitationlink/:employeeType - RoomAdmin can't get invitation link for Room admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.RoomAdmin,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.RoomAdmin,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/users/invitationlink/:employeeType - User cannot get invitation link for User", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } =
      await userApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.User,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/users/invitationlink/:employeeType - Guest cannot get invitation link for user", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } =
      await guestApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.User,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/users/invitationlink/:employeeType - Cannot get invitation link for Guest type", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data, status } =
      await ownerApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.Guest,
      });

    expect(status).toBe(400);
    expect((data as any).error.message).toBe("EmployeeType");
  });

  test("GET /api/2.0/users/invitationlink/:employeeType - RoomAdmin cannot get invitation link for DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.DocSpaceAdmin,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("GET /api/2.0/users/invitationlink/:employeeType - RoomAdmin cannot get invitation link for RoomAdmin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.RoomAdmin,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } =
      await roomAdminApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.RoomAdmin,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

// @deprecated — use getInvitationLinkByEmployeeType instead; returns StringWrapper (plain URL string) instead of InvitationLinkWrapper
test.describe("GET /api/2.0/portal/users/invite/:employeeType - access control (deprecated)", () => {
  test("GET /api/2.0/portal/users/invite/:employeeType - Anonymous cannot get invitation link", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.users.getInvitationLink({
      employeeType: EmployeeType.User,
    });

    expect(status).toBe(401);
  });

  // Deprecated endpoint does not enforce role-based access control —
  // returns 200 with an empty response instead of 403

  test("GET /api/2.0/portal/users/invite/:employeeType - DocSpaceAdmin gets empty response for DocSpaceAdmin type", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });

    const { api: adminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await adminApi.users.getInvitationLink({
      employeeType: EmployeeType.DocSpaceAdmin,
    });

    expect(status).toBe(200);
    expect(data.response).toBeFalsy();
  });

  test("GET /api/2.0/portal/users/invite/:employeeType - RoomAdmin gets empty response for RoomAdmin type", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.RoomAdmin,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.users.getInvitationLink({
      employeeType: EmployeeType.RoomAdmin,
    });

    expect(status).toBe(200);
    expect(data.response).toBeFalsy();
  });

  test("GET /api/2.0/portal/users/invite/:employeeType - RoomAdmin gets empty response for DocSpaceAdmin type", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.users.getInvitationLink({
      employeeType: EmployeeType.DocSpaceAdmin,
    });

    expect(status).toBe(200);
    expect(data.response).toBeFalsy();
  });

  test("GET /api/2.0/portal/users/invite/:employeeType - User gets empty response", async ({
    apiSdk,
  }) => {
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.users.getInvitationLink({
      employeeType: EmployeeType.User,
    });

    expect(status).toBe(200);
    expect(data.response).toBeFalsy();
  });

  test("GET /api/2.0/portal/users/invite/:employeeType - Guest gets empty response", async ({
    apiSdk,
  }) => {
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.users.getInvitationLink({
      employeeType: EmployeeType.User,
    });

    expect(status).toBe(200);
    expect(data.response).toBeFalsy();
  });
});

test.describe("PUT /api/2.0/users/invitationlink - access control", () => {
  test("PUT /api/2.0/users/invitationlink - Owner cannot update maxUseCount above 1000", async ({
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

    const { status } = await ownerApi.users.updateInvitationLink({
      invitationLinkUpdateRequestDto: {
        id: linkId,
        maxUseCount: 1001,
      },
    });

    expect(status).toBe(400);
  });

  test("PUT /api/2.0/users/invitationlink - Owner updates non-existent invitation link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.users.updateInvitationLink({
      invitationLinkUpdateRequestDto: {
        id: "00000000-0000-0000-0000-000000000000",
        maxUseCount: 10,
      },
    });

    expect(status).toBe(404);
  });

  test("PUT /api/2.0/users/invitationlink - Anonymous cannot update invitation link", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.users.updateInvitationLink({
      invitationLinkUpdateRequestDto: {
        id: "00000000-0000-0000-0000-000000000000",
        maxUseCount: 10,
      },
    });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/users/invitationlink - User cannot update invitation link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.User,
      },
    });
    const linkId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.users.updateInvitationLink({
      invitationLinkUpdateRequestDto: {
        id: linkId,
        maxUseCount: 10,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/users/invitationlink - Guest cannot update invitation link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.User,
      },
    });
    const linkId = created.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.users.updateInvitationLink({
      invitationLinkUpdateRequestDto: {
        id: linkId,
        maxUseCount: 10,
      },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("DELETE /api/2.0/users/invitationlink - access control", () => {
  test("DELETE /api/2.0/users/invitationlink - Owner deletes non-existent invitation link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { status } = await ownerApi.users.deleteInvitationLink({
      invitationLinkDeleteRequestDto: {
        id: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(status).toBe(404);
  });

  test("DELETE /api/2.0/users/invitationlink - Anonymous cannot delete invitation link", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.users.deleteInvitationLink({
      invitationLinkDeleteRequestDto: {
        id: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(status).toBe(401);
  });

  test("DELETE /api/2.0/users/invitationlink - RoomAdmin cannot delete Owner's invitation link for DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });
    const linkId = created.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.users.deleteInvitationLink({
      invitationLinkDeleteRequestDto: { id: linkId },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/users/invitationlink - Room admin cannot delete Owner's invitation link for Room admin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.RoomAdmin,
      },
    });
    const linkId = created.response!.id!;

    const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "RoomAdmin",
    );

    const { data, status } = await roomAdminApi.users.deleteInvitationLink({
      invitationLinkDeleteRequestDto: { id: linkId },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/users/invitationlink - DocSpace admin cannot delete Owner's invitation link for DocSpaceAdmin", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");

    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.DocSpaceAdmin,
      },
    });
    const linkId = created.response!.id!;

    const { api: docSpaceAdminApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "DocSpaceAdmin",
    );

    const { data, status } = await docSpaceAdminApi.users.deleteInvitationLink({
      invitationLinkDeleteRequestDto: { id: linkId },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/users/invitationlink - User cannot delete invitation link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.User,
      },
    });
    const linkId = created.response!.id!;

    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.users.deleteInvitationLink({
      invitationLinkDeleteRequestDto: { id: linkId },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("DELETE /api/2.0/users/invitationlink - Guest cannot delete invitation link", async ({
    apiSdk,
  }) => {
    const ownerApi = apiSdk.forRole("owner");
    const { data: created } = await ownerApi.users.createInvitationLink({
      invitationLinkCreateRequestDto: {
        employeeType: EmployeeType.User,
      },
    });
    const linkId = created.response!.id!;

    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.users.deleteInvitationLink({
      invitationLinkDeleteRequestDto: { id: linkId },
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/userscount - access control", () => {
  test("GET /api/2.0/portal/userscount - Anonymous cannot get users count", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();

    const { status } = await anonApi.users.getPortalUsersCount();

    expect(status).toBe(401);
  });

  for (const role of ["RoomAdmin", "User", "Guest"] as const) {
    test(`GET /api/2.0/portal/userscount - ${role} cannot get users count`, async ({
      apiSdk,
    }) => {
      await apiSdk.addMember("owner", "DocSpaceAdmin");
      await apiSdk.addMember("owner", "RoomAdmin");
      await apiSdk.addMember("owner", "User");
      await apiSdk.addMember("owner", "Guest");
      const { api: roleApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        role,
      );

      const { data, status } = await roleApi.users.getPortalUsersCount();

      expect(status).toBe(403);
      expect((data as any).error.message).toBe("Access denied");
    });
  }
});

test.describe("GET /api/2.0/portal/users/:userID - access control", () => {
  test("GET /api/2.0/portal/users/:userID - Anonymous cannot get user by ID", async ({
    apiSdk,
  }) => {
    const anonApi = apiSdk.forAnonymous();
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;

    const { status } = await anonApi.users.getUserById({ userID: userId });

    expect(status).toBe(401);
  });

  test("GET /api/2.0/portal/users/:userID - User cannot get user by ID", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;
    const { api: userApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );

    const { data, status } = await userApi.users.getUserById({
      userID: userId,
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toContain("Access denied");
  });

  test("GET /api/2.0/portal/users/:userID - Guest cannot get user by ID", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "RoomAdmin");
    const userId = userData.response!.id!;
    const { api: guestApi } = await apiSdk.addAuthenticatedMember(
      "owner",
      "Guest",
    );

    const { data, status } = await guestApi.users.getUserById({
      userID: userId,
    });

    expect(status).toBe(403);
    expect((data as any).error.message).toContain("Access denied");
  });

  test.fail(
    "BUG 81212: GET /api/2.0/portal/users/:userID - Returns 404 for non-existent user",
    async ({ apiSdk }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { data, status } = await ownerApi.users.getUserById({
        userID: "00000000-0000-0000-0000-000000000000",
      });

      expect(status).toBe(404);
      expect((data as any).error.message).toContain(
        "The user could not be found",
      );
    },
  );
});
