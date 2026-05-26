import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { Role } from "@/src/services/token-store";
import { UserType } from "@/src/services/api-sdk";

type RoleConfig = {
  role: Role;
  type: UserType;
};

const RESTRICTED_ROLES: RoleConfig[] = [
  { role: "roomAdmin", type: "RoomAdmin" },
  { role: "user", type: "User" },
  { role: "guest", type: "Guest" },
];

test.describe("GET /api/2.0/portal/quota - permissions", () => {
  test("GET /api/2.0/portal/quota - Anonymous cannot get portal quota", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().portalQuota.getPortalQuota();

    expect(status).toBe(401);
  });

  for (const { role, type } of RESTRICTED_ROLES) {
    test(`BUG 81340: GET /api/2.0/portal/quota - ${type} cannot get portal quota`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", type);

      const { data, status } = await apiSdk
        .forRole(role)
        .portalQuota.getPortalQuota();
      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    });
  }
});

test.describe("GET /api/2.0/portal/quota/right - permissions", () => {
  test("GET /api/2.0/portal/quota/right - Anonymous cannot get right quota", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk.forAnonymous().portalQuota.getRightQuota();

    expect(status).toBe(401);
  });

  for (const { role, type } of RESTRICTED_ROLES) {
    test(`GET /api/2.0/portal/quota/right - ${type} cannot get right quota`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", type);

      const { data, status } = await apiSdk
        .forRole(role)
        .portalQuota.getRightQuota();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    });
  }
});

test.describe("GET /api/2.0/portal/usedspace - permissions", () => {
  test("GET /api/2.0/portal/usedspace - Anonymous cannot get portal used space", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .portalQuota.getPortalUsedSpace();

    expect(status).toBe(401);
  });

  for (const { role, type } of RESTRICTED_ROLES) {
    test(`GET /api/2.0/portal/usedspace - ${type} cannot get portal used space`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", type);

      const { data, status } = await apiSdk
        .forRole(role)
        .portalQuota.getPortalUsedSpace();

      expect(status).toBe(403);
      expect((data as any)?.error?.message).toBe("Access denied");
    });
  }
});

test.describe("GET /api/2.0/portal/tariff - permissions", () => {
  test("GET /api/2.0/portal/tariff - Anonymous cannot get portal tariff", async ({
    apiSdk,
  }) => {
    const { status } = await apiSdk
      .forAnonymous()
      .portalQuota.getPortalTariff();

    expect(status).toBe(401);
  });

  for (const { role, type } of RESTRICTED_ROLES) {
    test(`GET /api/2.0/portal/tariff - ${type} gets limited tariff response`, async ({
      apiSdk,
    }) => {
      await apiSdk.addAuthenticatedMember("owner", type);

      const { data, status } = await apiSdk
        .forRole(role)
        .portalQuota.getPortalTariff();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(data.count).toBe(1);

      const tariff = data.response!;
      expect(tariff.id).toBe(0);
      expect(tariff.state).toBe(1);
    });
  }
});
