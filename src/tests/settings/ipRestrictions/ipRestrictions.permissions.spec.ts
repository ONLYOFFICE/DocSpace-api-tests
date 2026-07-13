import { expect } from "@playwright/test";
import { test } from "@/src/fixtures/index";

test.describe("GET /api/2.0/settings/iprestrictions - access control", () => {
  test("GET /api/2.0/settings/iprestrictions - Anonymous cannot get IP restrictions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .ipRestrictions.getIpRestrictions();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/iprestrictions - RoomAdmin cannot get IP restrictions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .ipRestrictions.getIpRestrictions();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("GET /api/2.0/settings/iprestrictions - User cannot get IP restrictions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .ipRestrictions.getIpRestrictions();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("GET /api/2.0/settings/iprestrictions - Guest cannot get IP restrictions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .ipRestrictions.getIpRestrictions();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("GET /api/2.0/settings/iprestrictions/settings - access control", () => {
  test("GET /api/2.0/settings/iprestrictions/settings - Anonymous cannot get IP restriction settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .ipRestrictions.readIpRestrictionsSettings();

    expect(status).toBe(401);
  });

  test("GET /api/2.0/settings/iprestrictions/settings - RoomAdmin cannot get IP restriction settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .ipRestrictions.readIpRestrictionsSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("GET /api/2.0/settings/iprestrictions/settings - User cannot get IP restriction settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .ipRestrictions.readIpRestrictionsSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("GET /api/2.0/settings/iprestrictions/settings - Guest cannot get IP restriction settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .ipRestrictions.readIpRestrictionsSettings();

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("PUT /api/2.0/settings/iprestrictions - access control", () => {
  test("PUT /api/2.0/settings/iprestrictions - Anonymous cannot save IP restrictions", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .ipRestrictions.saveIpRestrictions({
        ipRestrictionsDto: {
          ipRestrictions: [{ ip: "192.168.1.1", forAdmin: false }],
          enable: false,
        },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/iprestrictions - RoomAdmin cannot save IP restrictions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .ipRestrictions.saveIpRestrictions({
        ipRestrictionsDto: {
          ipRestrictions: [{ ip: "192.168.1.1", forAdmin: false }],
          enable: false,
        },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("PUT /api/2.0/settings/iprestrictions - User cannot save IP restrictions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .ipRestrictions.saveIpRestrictions({
        ipRestrictionsDto: {
          ipRestrictions: [{ ip: "192.168.1.1", forAdmin: false }],
          enable: false,
        },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("PUT /api/2.0/settings/iprestrictions - Guest cannot save IP restrictions", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .ipRestrictions.saveIpRestrictions({
        ipRestrictionsDto: {
          ipRestrictions: [{ ip: "192.168.1.1", forAdmin: false }],
          enable: false,
        },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});

test.describe("PUT /api/2.0/settings/iprestrictions/settings - access control", () => {
  test("PUT /api/2.0/settings/iprestrictions/settings - Anonymous cannot update IP restriction settings", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .ipRestrictions.updateIpRestrictionsSettings({
        ipRestrictionsDto: {
          ipRestrictions: null,
          enable: false,
        },
      });

    expect(status).toBe(401);
  });

  test("PUT /api/2.0/settings/iprestrictions/settings - RoomAdmin cannot update IP restriction settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "RoomAdmin");

    const { data, status } = await apiSdk
      .forRole("roomAdmin")
      .ipRestrictions.updateIpRestrictionsSettings({
        ipRestrictionsDto: {
          ipRestrictions: null,
          enable: false,
        },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("PUT /api/2.0/settings/iprestrictions/settings - User cannot update IP restriction settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "User");

    const { data, status } = await apiSdk
      .forRole("user")
      .ipRestrictions.updateIpRestrictionsSettings({
        ipRestrictionsDto: {
          ipRestrictions: null,
          enable: false,
        },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });

  test("PUT /api/2.0/settings/iprestrictions/settings - Guest cannot update IP restriction settings", async ({
    apiSdk,
  }) => {
    await apiSdk.addAuthenticatedMember("owner", "Guest");

    const { data, status } = await apiSdk
      .forRole("guest")
      .ipRestrictions.updateIpRestrictionsSettings({
        ipRestrictionsDto: {
          ipRestrictions: null,
          enable: false,
        },
      });

    expect(status).toBe(403);
    expect((data as any).statusCode).toBe(403);
  });
});
