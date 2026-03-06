import { test as base } from "@playwright/test";
import API from "@/src/services/api";
import { ApiSDK } from "../services/api-sdk";
import { PaymentApi } from "../services/payment-api";

type TestFixtures = {
  api: API;
  apiSdk: ApiSDK;
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

    await api.auth.authenticateOwner();
    console.log(`Deleting portal: ${api.portalDomain}`);
    await api.cleanup();

    await ownerContext.dispose();
  },

  apiSdk: async ({ api, request }, use) => {
    const sdk = new ApiSDK(request, api.tokenStore);
    await use(sdk);
  },

  paymentsApi: async ({ api }, use) => {
    const paymentsApi = new PaymentApi(api.ownerContext, api.apisystem);
    await use(paymentsApi);
  },
});
