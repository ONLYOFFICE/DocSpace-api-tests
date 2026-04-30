import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";

test.describe("GET /api/2.0/portal - permissions", () => {
  test("GET /api/2.0/portal - Anonymous cannot get portal information", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .portalSettings.getPortalInformation();

    expect(status).toBe(401);
  });
});

test.describe("POST /api/2.0/portal/suspend - permissions", () => {
  test("POST /api/2.0/portal/suspend - Anonymous cannot send suspension instructions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .portalSettings.sendSuspendInstructions();

    expect(status).toBe(401);
  });

  test.fail(
    "BUG : POST /api/2.0/portal/suspend - DocSpaceAdmin cannot send suspension instructions",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .portalSettings.sendSuspendInstructions();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );

  test("POST /api/2.0/portal/suspend - RoomAdmin cannot send suspension instructions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .portalSettings.sendSuspendInstructions();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/suspend - User cannot send suspension instructions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .portalSettings.sendSuspendInstructions();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/suspend - Guest cannot send suspension instructions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .portalSettings.sendSuspendInstructions();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("POST /api/2.0/portal/delete - permissions", () => {
  test("POST /api/2.0/portal/delete - Anonymous cannot send deletion instructions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .portalSettings.sendDeleteInstructions();

    expect(status).toBe(401);
  });

  test.fail(
    "BUG : POST /api/2.0/portal/delete - DocSpaceAdmin cannot send deletion instructions",
    async ({ apiSdk }) => {
      await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");

      const { data, status } = await apiSdk
        .forRole("docSpaceAdmin")
        .portalSettings.sendDeleteInstructions();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    },
  );

  test("POST /api/2.0/portal/delete - RoomAdmin cannot send deletion instructions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .portalSettings.sendDeleteInstructions();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/delete - User cannot send deletion instructions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .portalSettings.sendDeleteInstructions();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });

  test("POST /api/2.0/portal/delete - Guest cannot send deletion instructions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .portalSettings.sendDeleteInstructions();

    expect(status).toBe(403);
    expect((data as any)?.error?.message).toBe("Access denied");
  });
});

test.describe("GET /api/2.0/portal/path - permissions", () => {
  test("GET /api/2.0/portal/path - Anonymous cannot get portal path", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .portalSettings.getPortalPath({});

    expect(status).toBe(401);
  });
});
