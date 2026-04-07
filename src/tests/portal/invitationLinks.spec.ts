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

    test("POST /api/2.0/users/invitationlink - Owner cannot create invitation link for Guest", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.Guest,
        },
      });

      expect(status).toBe(400);
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

    test("POST /api/2.0/users/invitationlink - Owner cannot create invitation link with maxUseCount above 1000", async ({
      apiSdk,
    }) => {
      const ownerApi = apiSdk.forRole("owner");

      const { status } = await ownerApi.users.createInvitationLink({
        invitationLinkCreateRequestDto: {
          employeeType: EmployeeType.User,
          maxUseCount: 1001,
        },
      });

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
      expect(data.response!.employeeType).toBe(1); // 1 = RoomAdmin
      expect(data.response!.url).toBeTruthy();
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
  });
});
