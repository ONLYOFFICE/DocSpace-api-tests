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

test.describe("GET /api/2.0/portal/quota/right", () => {
  for (const { role, label, needsSetup } of ROLES) {
    test(`GET /api/2.0/portal/quota/right - ${label} gets right quota compared to current`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();

      if (needsSetup) {
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      }

      const client = apiSdk.forRole(role);

      const [{ data: currentData }, { data: rightData, status }] =
        await Promise.all([
          client.portalQuota.getPortalQuota(),
          client.portalQuota.getRightQuota(),
        ]);

      expect(status).toBe(200);
      expect(rightData.statusCode).toBe(200);

      const current = currentData.response!;
      const right = rightData.response!;

      // structure
      expect(right.tenantId).toBeDefined();
      expect(right.name).toBeDefined();
      expect(right.productId).toBeTruthy();
      expect(right.visible).toBe(true);
      expect(right.features).toBeDefined();
      expect(right.maxFileSize).toBeGreaterThan(0);
      expect(right.maxTotalSize).toBeGreaterThan(0);
      expect(right.countUser).toBeDefined();
      expect(right.countRoomAdmin).toBeDefined();

      // right quota should be cheaper or equal to current (it's the minimum needed)
      expect(right.price).toBeLessThanOrEqual(current.price!);

      // right quota covers less or equal storage than current
      expect(right.maxTotalSize).toBeLessThanOrEqual(current.maxTotalSize!);

      // right quota requires fewer or equal managers than current
      expect(right.countRoomAdmin).toBeLessThanOrEqual(current.countRoomAdmin!);
    });
  }
});

test.describe("GET /api/2.0/portal/usedspace", () => {
  for (const { role, label, needsSetup } of ROLES) {
    test(`GET /api/2.0/portal/usedspace - ${label} gets portal used space`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();

      if (needsSetup) {
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      }

      const { data, status } = await apiSdk
        .forRole(role)
        .portalQuota.getPortalUsedSpace();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);
      expect(typeof data.response).toBe("number");
      expect(data.response).toBeGreaterThanOrEqual(0);
    });
  }
});

test.describe("GET /api/2.0/portal/tariff", () => {
  for (const { role, label, needsSetup } of ROLES) {
    test(`GET /api/2.0/portal/tariff - ${label} gets portal tariff`, async ({
      apiSdk,
      paymentsApi,
    }) => {
      await paymentsApi.setupPayment();

      if (needsSetup) {
        await apiSdk.addAuthenticatedMember("owner", "DocSpaceAdmin");
      }

      const { data, status } = await apiSdk
        .forRole(role)
        .portalQuota.getPortalTariff();

      expect(status).toBe(200);
      expect(data.statusCode).toBe(200);

      const tariff = data.response!;
      expect((tariff as any).openSource).toBe(false);
      expect((tariff as any).enterprise).toBe(false);
      expect((tariff as any).developer).toBe(false);
      expect(tariff.id).toBeDefined();
      expect(tariff.state).toBe(1);
      expect(tariff.dueDate).toBeTruthy();
      expect(tariff.delayDueDate).toBeDefined();
      expect(tariff.licenseDate).toBeDefined();
      expect(tariff.customerId).toBeTruthy();

      expect(Array.isArray(tariff.quotas)).toBe(true);
      expect(tariff.quotas!.length).toBeGreaterThan(0);
      for (const quota of tariff.quotas!) {
        expect(quota.id).toBeDefined();
        expect(quota.quantity).toBeDefined();
        expect(quota.wallet).toBeDefined();
      }
    });
  }
});
