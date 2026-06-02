import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("GET /api/2.0/security/activeconnections - permissions", () => {
  test("GET /api/2.0/security/activeconnections - Anonymous cannot get active connections", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .activeConnections.getAllActiveConnections();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/security/activeconnections - User sees only their own connections, not other users'", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data: ownerData } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();

    const { data: adminData } = await apiSdk
      .forRole("docSpaceAdmin")
      .activeConnections.getAllActiveConnections();

    const ownerUserId = ownerData.response!.items![0].userId;
    const adminUserIds = adminData.response!.items!.map((i) => i.userId);

    expect(adminUserIds).not.toContain(ownerUserId);
  });
});

test.describe("PUT /api/2.0/security/activeconnections/logout/{loginEventId} - permissions", () => {
  test("PUT /api/2.0/security/activeconnections/logout/{loginEventId} - Anonymous cannot log out connection", async ({
    apiSdk,
  }) => {
    const { data: connectionsData } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();

    const loginEventId = connectionsData.response!.items![0].id;

    const { status } = await apiSdk
      .forAnonymous()
      .activeConnections.logOutActiveConnection({ loginEventId });

    expect(status).toBe(401);
  });

  test.fail(
    "BUG 81824: PUT /api/2.0/security/activeconnections/logout/{loginEventId} - DocSpaceAdmin cannot log out Owner's connection",
    async ({ apiSdk }) => {
      const { data: ownerConnectionsData } = await apiSdk
        .forRole("owner")
        .activeConnections.getAllActiveConnections();

      const ownerLoginEventId = ownerConnectionsData.response!.items![0].id;

      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

      const { status } = await apiSdk
        .forRole("docSpaceAdmin")
        .activeConnections.logOutActiveConnection({
          loginEventId: ownerLoginEventId,
        });

      expect(status).toBe(403);
    },
  );

  test.fail(
    "BUG 81824: PUT /api/2.0/security/activeconnections/logout/{loginEventId} - RoomAdmin cannot log out Owner's connection",
    async ({ apiSdk }) => {
      const { data: ownerConnectionsData } = await apiSdk
        .forRole("owner")
        .activeConnections.getAllActiveConnections();

      const ownerLoginEventId = ownerConnectionsData.response!.items![0].id;

      await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

      const { status } = await apiSdk
        .forRole("roomAdmin")
        .activeConnections.logOutActiveConnection({
          loginEventId: ownerLoginEventId,
        });

      expect(status).toBe(403);
    },
  );

  test.fail(
    "BUG 81824: PUT /api/2.0/security/activeconnections/logout/{loginEventId} - User cannot log out Owner's connection",
    async ({ apiSdk }) => {
      const { data: ownerConnectionsData } = await apiSdk
        .forRole("owner")
        .activeConnections.getAllActiveConnections();

      const ownerLoginEventId = ownerConnectionsData.response!.items![0].id;

      await apiSdk.addAuthenticatedMember("owner", "User");

      const { status } = await apiSdk
        .forRole("user")
        .activeConnections.logOutActiveConnection({
          loginEventId: ownerLoginEventId,
        });

      expect(status).toBe(403);
    },
  );

  test.fail(
    "BUG 81824: PUT /api/2.0/security/activeconnections/logout/{loginEventId} - Guest cannot log out Owner's connection",
    async ({ apiSdk }) => {
      const { data: ownerConnectionsData } = await apiSdk
        .forRole("owner")
        .activeConnections.getAllActiveConnections();

      const ownerLoginEventId = ownerConnectionsData.response!.items![0].id;

      await apiSdk.addAuthenticatedMember("owner", "Guest");

      const { status } = await apiSdk
        .forRole("guest")
        .activeConnections.logOutActiveConnection({
          loginEventId: ownerLoginEventId,
        });

      expect(status).toBe(403);
    },
  );
});

test.describe("PUT /api/2.0/security/activeconnections/logoutallchangepassword - permissions", () => {
  test("PUT /api/2.0/security/activeconnections/logoutallchangepassword - Anonymous cannot log out all connections", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .activeConnections.logOutAllActiveConnectionsChangePassword();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/security/activeconnections/logoutallexceptthis - permissions", () => {
  test("PUT /api/2.0/security/activeconnections/logoutallexceptthis - Anonymous cannot log out all other connections", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .activeConnections.logOutAllExceptThisConnection();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/security/activeconnections/logoutall/{userId} - permissions", () => {
  test("PUT /api/2.0/security/activeconnections/logoutall/{userId} - Anonymous cannot log out user's connections", async ({
    apiSdk,
  }) => {
    const { data: ownerConnData } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();
    const ownerUserId = ownerConnData.response!.items![0].userId;

    const { status } = await apiSdk
      .forAnonymous()
      .activeConnections.logOutAllActiveConnectionsForUser({
        userId: ownerUserId,
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/security/activeconnections/logoutall/{userId} - RoomAdmin cannot log out another user's connections", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data: ownerConnData } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();
    const ownerUserId = ownerConnData.response!.items![0].userId;

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .activeConnections.logOutAllActiveConnectionsForUser({
        userId: ownerUserId,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/security/activeconnections/logoutall/{userId} - User cannot log out another user's connections", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: ownerConnData } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();
    const ownerUserId = ownerConnData.response!.items![0].userId;

    const { data, status } = await apiSdk
      .forRole("user")
      .activeConnections.logOutAllActiveConnectionsForUser({
        userId: ownerUserId,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });

  test("PUT /api/2.0/security/activeconnections/logoutall/{userId} - Guest cannot log out another user's connections", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data: ownerConnData } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();
    const ownerUserId = ownerConnData.response!.items![0].userId;

    const { data, status } = await apiSdk
      .forRole("guest")
      .activeConnections.logOutAllActiveConnectionsForUser({
        userId: ownerUserId,
      });

    expect(status).toBe(403);
    expect((data as any).error.message).toBe("Access denied");
  });
});
