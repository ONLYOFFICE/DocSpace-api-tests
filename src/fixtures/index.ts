import { test as base } from "@playwright/test";
import API from "@/src/services/api";
import { ApiSDK } from "../services/api-sdk";
import { PaymentApi } from "../services/payment-api";

// Portals whose cleanup failed, reprinted when the worker exits.
const orphanedPortals: string[] = [];

process.on("exit", () => {
  if (orphanedPortals.length === 0) return;
  console.warn(
    `ORPHANED PORTALS (${orphanedPortals.length}) left by this worker: ${orphanedPortals.join(", ")}`,
  );
});

type TestFixtures = {
  api: API;
  apiSdk: ApiSDK;
  /**
   * An ApiSDK bound to its own request context (and therefore its own cookie
   * jar). `apiSdk` shares the default context, where any login stores an auth
   * cookie that then overrides the Bearer token of every later call - so tests
   * that log users in must do it through this client to keep owner setup calls
   * on `apiSdk` unaffected.
   */
  isolatedSdk: ApiSDK;
  paymentsApi: PaymentApi;
};

export const test = base.extend<TestFixtures>({
  api: async ({ playwright }, use) => {
    const ownerContext = await playwright.request.newContext({
      timeout: 30000,
    });
    const api = new API(ownerContext);

    await api.setup();
    console.log(`Portal domain: ${api.portalDomain}`);

    await use(api);

    try {
      await api.auth.authenticateOwner();
      console.log(`Deleting portal: ${api.portalDomain}`);
      await api.cleanup();
    } catch (error) {
      orphanedPortals.push(api.portalDomain);
      console.warn(
        `ORPHANED PORTAL: cleanup failed for ${api.portalDomain}. Reason: ${error}`,
      );
    }

    await ownerContext.dispose();
  },

  apiSdk: async ({ api, request }, use) => {
    const sdk = new ApiSDK(request, api.tokenStore);
    await use(sdk);
  },

  isolatedSdk: async ({ api, playwright }, use) => {
    const context = await playwright.request.newContext({ timeout: 30000 });
    await use(new ApiSDK(context, api.tokenStore));
    await context.dispose();
  },

  paymentsApi: async ({ api }, use) => {
    const paymentsApi = new PaymentApi(api.ownerContext, api.apisystem);
    await use(paymentsApi);
  },
});
