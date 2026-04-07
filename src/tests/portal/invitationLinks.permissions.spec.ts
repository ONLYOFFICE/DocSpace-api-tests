import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";
import { EmployeeType } from "@onlyoffice/docspace-api-sdk";

test.describe("Portal — Invitation Links (permissions)", () => {
  test.describe("POST /api/2.0/users/invitationlink - access control", () => {
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

    test("POST /api/2.0/users/invitationlink - DocSpaceAdmin can create invitation link", async ({
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

    test("POST /api/2.0/users/invitationlink - RoomAdmin can create invitation link", async ({
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

    test("POST /api/2.0/users/invitationlink - RoomAdmin cannot create invitation link for DocSpaceAdmin", async ({
      apiSdk,
    }) => {
      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { status } = await roomAdminApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.DocSpaceAdmin,
        },
      });

      expect(status).toBe(403);
    });

    test("POST /api/2.0/users/invitationlink - RoomAdmin cannot create invitation link for RoomAdmin", async ({
      apiSdk,
    }) => {
      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { status } = await roomAdminApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.RoomAdmin,
        },
      });

      expect(status).toBe(403);
    });

    test("POST /api/2.0/users/invitationlink - User cannot create invitation link", async ({
      apiSdk,
    }) => {
      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      expect(status).toBe(403);
    });

    test("POST /api/2.0/users/invitationlink - Guest cannot create invitation link", async ({
      apiSdk,
    }) => {
      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
        },
      });

      expect(status).toBe(403);
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

    test("GET /api/2.0/users/invitationlink/:employeeType - DocSpaceAdmin can get invitation link", async ({
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

      const { status } = await adminApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.User,
      });

      expect(status).toBe(200);
    });

    test("GET /api/2.0/users/invitationlink/:employeeType - RoomAdmin can get invitation link", async ({
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

      const { status } =
        await roomAdminApi.users.getInvitationLinkByEmployeeType({
          employeeType: EmployeeType.User,
        });

      expect(status).toBe(200);
    });

    test("GET /api/2.0/users/invitationlink/:employeeType - User cannot get invitation link", async ({
      apiSdk,
    }) => {
      const { api: userApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "User",
      );

      const { status } = await userApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.User,
      });

      expect(status).toBe(403);
    });

    test("GET /api/2.0/users/invitationlink/:employeeType - Guest cannot get invitation link", async ({
      apiSdk,
    }) => {
      const { api: guestApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "Guest",
      );

      const { status } = await guestApi.users.getInvitationLinkByEmployeeType({
        employeeType: EmployeeType.User,
      });

      expect(status).toBe(403);
    });
  });

  test.describe("PUT /api/2.0/users/invitationlink - access control", () => {
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

    test("PUT /api/2.0/users/invitationlink - RoomAdmin can update invitation link", async ({
      apiSdk,
    }) => {
      const { api: roomAdminApi } = await apiSdk.addAuthenticatedMember(
        "owner",
        "RoomAdmin",
      );

      const { data: created } = await roomAdminApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          maxUseCount: 5,
        },
      });
      const linkId = created.response!.id!;

      const { data, status } = await roomAdminApi.users.updateInvitationLink({
        invitationLinkUpdateRequestDto: {
          id: linkId,
          maxUseCount: 10,
        },
      });

      expect(status).toBe(200);
      expect(data.response).toBeDefined();
      expect(data.response!.maxUseCount).toBe(10);
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

      const { status } = await userApi.users.updateInvitationLink({
        invitationLinkUpdateRequestDto: {
          id: linkId,
          maxUseCount: 10,
        },
      });

      expect(status).toBe(403);
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

      const { status } = await guestApi.users.updateInvitationLink({
        invitationLinkUpdateRequestDto: {
          id: linkId,
          maxUseCount: 10,
        },
      });

      expect(status).toBe(403);
    });
  });

  test.describe("DELETE /api/2.0/users/invitationlink - access control", () => {
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

      const { status } = await roomAdminApi.users.deleteInvitationLink({
        invitationLinkDeleteRequestDto: { id: linkId },
      });

      expect(status).toBe(403);
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

      const { status } = await userApi.users.deleteInvitationLink({
        invitationLinkDeleteRequestDto: { id: linkId },
      });

      expect(status).toBe(403);
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

      const { status } = await guestApi.users.deleteInvitationLink({
        invitationLinkDeleteRequestDto: { id: linkId },
      });

      expect(status).toBe(403);
    });
  });
});
