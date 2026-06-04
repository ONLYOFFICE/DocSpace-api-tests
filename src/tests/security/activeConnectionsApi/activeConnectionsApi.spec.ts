import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("GET /api/2.0/security/activeconnections", () => {
  test("GET /api/2.0/security/activeconnections - Owner gets active connections list", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();

    expect(status).toBe(200);
    expect(data.response).toBeDefined();
    expect(typeof data.response!.loginEvent).toBe("number");
    expect(Array.isArray(data.response!.items)).toBe(true);
    expect(data.response!.items!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/security/activeconnections - Response items have correct field types", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();

    const item = data.response!.items![0];

    expect(typeof item.id).toBe("number");
    expect(typeof item.tenantId).toBe("number");
    expect(typeof item.userId).toBe("string");
    expect(typeof item.mobile).toBe("boolean");
    // Optional string fields — may be null but not undefined
    expect(item.ip === null || typeof item.ip === "string").toBe(true);
    expect(item.browser === null || typeof item.browser === "string").toBe(
      true,
    );
    expect(item.platform === null || typeof item.platform === "string").toBe(
      true,
    );
    expect(item.country === null || typeof item.country === "string").toBe(
      true,
    );
    expect(item.city === null || typeof item.city === "string").toBe(true);
    expect(item.page === null || typeof item.page === "string").toBe(true);
  });

  test("GET /api/2.0/security/activeconnections - Response item date is a valid ISO date string", async ({
    apiSdk,
  }) => {
    const { data } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();

    const item = data.response!.items![0];
    expect(item.date).toBeDefined();
    expect(new Date(item.date as string).getTime()).not.toBeNaN();
  });

  test("GET /api/2.0/security/activeconnections - DocSpaceAdmin gets their own connections", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .activeConnections.getAllActiveConnections();

    expect(status).toBe(200);
    expect(data.response!.items!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/security/activeconnections - RoomAdmin gets their own connections", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .activeConnections.getAllActiveConnections();

    expect(status).toBe(200);
    expect(data.response!.items!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/security/activeconnections - User gets their own connections", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .activeConnections.getAllActiveConnections();

    expect(status).toBe(200);
    expect(data.response!.items!.length).toBeGreaterThan(0);
  });

  test("GET /api/2.0/security/activeconnections - Guest gets their own connections", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .activeConnections.getAllActiveConnections();

    expect(status).toBe(200);
    expect(data.response!.items!.length).toBeGreaterThan(0);
  });
});

test.describe("PUT /api/2.0/security/activeconnections/logout/{loginEventId}", () => {
  test("PUT /api/2.0/security/activeconnections/logout/{loginEventId} - User logs out their own connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: connectionsData } = await apiSdk
      .forRole("user")
      .activeConnections.getAllActiveConnections();

    const loginEventId = connectionsData.response!.items![0].id;

    const { data, status } = await apiSdk
      .forRole("user")
      .activeConnections.logOutActiveConnection({ loginEventId });

    expect(status).toBe(200);
    expect(data.response).toBe(true);

    // Token is now invalidated — subsequent call returns 401
    const { status: statusAfter } = await apiSdk
      .forRole("user")
      .activeConnections.getAllActiveConnections();

    expect(statusAfter).toBe(401);
  });

  test("PUT /api/2.0/security/activeconnections/logout/{loginEventId} - DocSpaceAdmin logs out their own connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data: connectionsData } = await apiSdk
      .forRole("docSpaceAdmin")
      .activeConnections.getAllActiveConnections();

    const loginEventId = connectionsData.response!.items![0].id;

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .activeConnections.logOutActiveConnection({ loginEventId });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/security/activeconnections/logout/{loginEventId} - RoomAdmin logs out their own connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data: connectionsData } = await apiSdk
      .forRole("roomAdmin")
      .activeConnections.getAllActiveConnections();

    const loginEventId = connectionsData.response!.items![0].id;

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .activeConnections.logOutActiveConnection({ loginEventId });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/security/activeconnections/logout/{loginEventId} - Guest logs out their own connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data: connectionsData } = await apiSdk
      .forRole("guest")
      .activeConnections.getAllActiveConnections();

    const loginEventId = connectionsData.response!.items![0].id;

    const { data, status } = await apiSdk
      .forRole("guest")
      .activeConnections.logOutActiveConnection({ loginEventId });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/security/activeconnections/logout/{loginEventId} - Owner logs out another user's connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data: connectionsData } = await apiSdk
      .forRole("user")
      .activeConnections.getAllActiveConnections();

    const loginEventId = connectionsData.response!.items![0].id;

    const { data, status } = await apiSdk
      .forRole("owner")
      .activeConnections.logOutActiveConnection({ loginEventId });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
  });

  test("PUT /api/2.0/security/activeconnections/logout/{loginEventId} - DocSpaceAdmin logs out another user's connection", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data: ownerConnectionsData } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();

    const loginEventId = ownerConnectionsData.response!.items![0].id;

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .activeConnections.logOutActiveConnection({ loginEventId });

    expect(status).toBe(200);
    expect(data.response).toBe(true);
    expect(data.count).toBe(1);
  });
});

function assertPasswordChangeUrl(data: { response?: string | null }) {
  expect(data.response).toBeDefined();
  expect(data.response).toContain("/confirm/PasswordChange");
  expect(data.response).toContain("type=PasswordChange");
  expect(data.response).toContain("key=");
  expect(data.response).toContain("uid=");
}

test.describe("PUT /api/2.0/security/activeconnections/logoutallchangepassword", () => {
  test("PUT /api/2.0/security/activeconnections/logoutallchangepassword - Owner logs out all connections and changes password", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .activeConnections.logOutAllActiveConnectionsChangePassword();

    expect(status).toBe(200);
    assertPasswordChangeUrl(data);
    expect(data.count).toBe(1);

    // Token is now invalidated — subsequent call returns 401
    const { status: statusAfter } = await apiSdk
      .forRole("owner")
      .activeConnections.getAllActiveConnections();

    expect(statusAfter).toBe(401);
  });

  test("PUT /api/2.0/security/activeconnections/logoutallchangepassword - DocSpaceAdmin logs out all connections and changes password", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .activeConnections.logOutAllActiveConnectionsChangePassword();

    expect(status).toBe(200);
    assertPasswordChangeUrl(data);
  });

  test("PUT /api/2.0/security/activeconnections/logoutallchangepassword - RoomAdmin logs out all connections and changes password", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .activeConnections.logOutAllActiveConnectionsChangePassword();

    expect(status).toBe(200);
    assertPasswordChangeUrl(data);
  });

  test("PUT /api/2.0/security/activeconnections/logoutallchangepassword - User logs out all connections and changes password", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .activeConnections.logOutAllActiveConnectionsChangePassword();

    expect(status).toBe(200);
    assertPasswordChangeUrl(data);
  });

  test("PUT /api/2.0/security/activeconnections/logoutallchangepassword - Guest logs out all connections and changes password", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .activeConnections.logOutAllActiveConnectionsChangePassword();

    expect(status).toBe(200);
    assertPasswordChangeUrl(data);
  });
});

test.describe("PUT /api/2.0/security/activeconnections/logoutall/{userId}", () => {
  test("PUT /api/2.0/security/activeconnections/logoutall/{userId} - Owner logs out all connections for a user", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    await test.step("Owner logs out user's connections", async () => {
      const { status } = await apiSdk
        .forRole("owner")
        .activeConnections.logOutAllActiveConnectionsForUser({ userId });

      expect(status).toBe(200);
    });
  });

  test("PUT /api/2.0/security/activeconnections/logoutall/{userId} - DocSpaceAdmin logs out all connections for a user", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data: userData } = await apiSdk.addMember("owner", "User");
    const userId = userData.response!.id!;

    const { status } = await apiSdk
      .forRole("docSpaceAdmin")
      .activeConnections.logOutAllActiveConnectionsForUser({ userId });

    expect(status).toBe(200);
  });

  test("PUT /api/2.0/security/activeconnections/logoutall/{userId} - Token is invalidated after Owner logs out user", async ({
    apiSdk,
  }) => {
    const { data: userData } = await apiSdk.addAuthenticatedMember(
      "owner",
      "User",
    );
    const userId = userData.response!.id!;

    await apiSdk
      .forRole("owner")
      .activeConnections.logOutAllActiveConnectionsForUser({ userId });

    // User's token is now invalidated
    const { status } = await apiSdk
      .forRole("user")
      .activeConnections.getAllActiveConnections();

    expect(status).toBe(401);
  });
});

test.describe("PUT /api/2.0/security/activeconnections/logoutallexceptthis", () => {
  test("PUT /api/2.0/security/activeconnections/logoutallexceptthis - Owner calls and gets 200", async ({
    apiSdk,
  }) => {
    const { data, status } = await apiSdk
      .forRole("owner")
      .activeConnections.logOutAllExceptThisConnection();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response).toBe("string");
    expect((data.response as string).length).toBeGreaterThan(0);
  });

  test("PUT /api/2.0/security/activeconnections/logoutallexceptthis - Other sessions are invalidated after call", async ({
    apiSdk,
  }) => {
    const { userData } = await apiSdk.addAuthenticatedMember("owner", "User");
    const firstToken = apiSdk.tokenStore.getToken("user");

    await apiSdk.authenticateMember(userData, "User");

    await test.step("Verify two active sessions exist", async () => {
      const { data } = await apiSdk
        .forRole("user")
        .activeConnections.getAllActiveConnections();

      expect(data.response!.items!.length).toBe(2);
    });

    await test.step("Call logOutAllExceptThisConnection", async () => {
      const { data, status } = await apiSdk
        .forRole("user")
        .activeConnections.logOutAllExceptThisConnection();

      expect(status).toBe(200);
      expect(data.count).toBe(1);
      expect(typeof data.response).toBe("string");
    });

    await test.step("First session is invalidated", async () => {
      const { status } = await apiSdk
        .forToken(firstToken)
        .activeConnections.getAllActiveConnections();

      expect(status).toBe(401);
    });
  });

  test("PUT /api/2.0/security/activeconnections/logoutallexceptthis - DocSpaceAdmin calls and gets 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

    const { data, status } = await apiSdk
      .forRole("docSpaceAdmin")
      .activeConnections.logOutAllExceptThisConnection();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response).toBe("string");
  });

  test("PUT /api/2.0/security/activeconnections/logoutallexceptthis - RoomAdmin calls and gets 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .activeConnections.logOutAllExceptThisConnection();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response).toBe("string");
  });

  test("PUT /api/2.0/security/activeconnections/logoutallexceptthis - User calls and gets 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .activeConnections.logOutAllExceptThisConnection();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response).toBe("string");
  });

  test("PUT /api/2.0/security/activeconnections/logoutallexceptthis - Guest calls and gets 200", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .activeConnections.logOutAllExceptThisConnection();

    expect(status).toBe(200);
    expect(data.count).toBe(1);
    expect(typeof data.response).toBe("string");
  });
});
