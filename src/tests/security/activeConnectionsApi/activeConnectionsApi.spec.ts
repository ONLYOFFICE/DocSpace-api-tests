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
});
