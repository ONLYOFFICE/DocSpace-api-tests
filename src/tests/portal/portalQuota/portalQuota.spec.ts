import { expect } from "@playwright/test";
import { test } from "@/src/fixtures";
import { Role } from "@/src/services/token-store";

type RoleConfig = {
  role: Role;
  label: string;
  needsSetup: boolean;
};

const ROLES: RoleConfig[] = [
  { role: "owner", label: "Owner", needsSetup: false },
  { role: "docSpaceAdmin", label: "DocSpaceAdmin", needsSetup: true },
];

test.describe("GET /api/2.0/portal/quota", () => {
  for (const { role, label, needsSetup } of ROLES) {
    test(`GET /api/2.0/portal/quota - ${label} gets portal quota`, async ({
      apiSdk,
    }) => {
      if (needsSetup) {
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      }

      const { data, status } = await apiSdk
        .forRole(role)
        .portalQuota.getPortalQuota();

      expect(status).toBe(200);

      const quota = data.response!;
      expect(quota.tenantId).toBeDefined();
      expect(quota.name).toBe("startup");
      expect(quota.price).toBe(0);
      expect(quota.visible).toBe(false);
      expect(quota.wallet).toBe(false);
      expect(quota.features).toBeDefined();
      expect(quota.maxFileSize).toBeDefined();
      expect(quota.maxTotalSize).toBe(2147483648);
      expect(quota.countUser).toBeDefined();
      expect(quota.countRoomAdmin).toBe(3);
      expect(quota.usersInRoom).toBeDefined();
      expect(quota.countRoom).toBe(12);
      expect(quota.nonProfit).toBe(false);
      expect(quota.trial).toBe(false);
      expect(quota.free).toBe(true);
      expect(quota.update).toBe(false);
      expect(quota.audit).toBe(false);
      expect(quota.docsEdition).toBe(false);
      expect(quota.ldap).toBe(false);
      expect(quota.sso).toBe(false);
      expect(quota.statistic).toBe(false);
      expect(quota.branding).toBe(false);
      expect(quota.customization).toBe(false);
      expect(quota.lifetime).toBe(false);
      expect(quota.automationApi).toBe(true);
      expect(quota.custom).toBe(false);
      expect(quota.restore).toBe(false);
      expect(quota.oauth).toBe(true);
      expect(quota.contentSearch).toBe(false);
      expect(quota.thirdParty).toBe(false);
      expect(quota.year).toBe(false);
      expect(quota.countFreeBackup).toBe(0);
      expect(quota.backup).toBe(false);
      expect(quota.countAIAgent).toBeDefined();
      expect((quota as any).aiTools).toBe(false);
    });
  }
});

test.describe("GET /api/2.0/portal/quota - paid portal", () => {
  for (const { role, label, needsSetup } of ROLES) {
    test(`GET /api/2.0/portal/quota - ${label} gets portal quota on paid portal`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();

      if (needsSetup) {
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      }

      const { data, status } = await apiSdk
        .forRole(role)
        .portalQuota.getPortalQuota();

      expect(status).toBe(200);

      const quota = data.response!;
      expect(quota.tenantId).toBeDefined();
      expect(quota.name).toBe("admin");
      expect(quota.price).toBe(200);
      expect(quota.productId).toBe("1006");
      expect(quota.visible).toBe(true);
      expect(quota.wallet).toBe(false);
      expect(quota.features).toBeDefined();
      expect(quota.maxFileSize).toBe(1073741824);
      expect(quota.maxTotalSize).toBe(2684354560000);
      expect(quota.countUser).toBeDefined();
      expect(quota.countRoomAdmin).toBe(10);
      expect(quota.usersInRoom).toBeDefined();
      expect(quota.countRoom).toBeDefined();
      expect(quota.nonProfit).toBe(false);
      expect(quota.trial).toBe(false);
      expect(quota.free).toBe(false);
      expect(quota.update).toBe(false);
      expect(quota.audit).toBe(true);
      expect(quota.docsEdition).toBe(false);
      expect(quota.ldap).toBe(true);
      expect(quota.sso).toBe(true);
      expect(quota.statistic).toBe(true);
      expect(quota.branding).toBe(false);
      expect(quota.customization).toBe(true);
      expect(quota.lifetime).toBe(false);
      expect(quota.automationApi).toBe(true);
      expect(quota.custom).toBe(false);
      expect(quota.restore).toBe(true);
      expect(quota.oauth).toBe(true);
      expect(quota.contentSearch).toBe(true);
      expect(quota.thirdParty).toBe(true);
      expect(quota.year).toBe(false);
      expect(quota.countFreeBackup).toBe(2);
      expect(quota.backup).toBe(false);
      expect(quota.countAIAgent).toBeDefined();
      expect((quota as any).aiTools).toBe(false);
    });
  }
});
