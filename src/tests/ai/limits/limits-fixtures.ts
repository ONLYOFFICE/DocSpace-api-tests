import { APIRequestContext, expect } from "@playwright/test";
import { test as base } from "@/src/fixtures";
import API from "@/src/services/api";
import { PaymentApi } from "@/src/services/payment-api";
import { ApiSDK, UserType } from "@/src/services/api-sdk";
import { AiAgentChat } from "@/src/helpers/ai-agent-chat";
import { AiWebSearch } from "@/src/helpers/ai-web-search";
import { Role } from "@/src/services/token-store";
import { accountingPeriod } from "@/src/helpers/wallet-services";

const TYPE_TO_ROLE: Record<UserType, Role> = {
  DocSpaceAdmin: "docSpaceAdmin",
  RoomAdmin: "roomAdmin",
  User: "user",
  Guest: "guest",
};

/** A portal member who is logged in through a request context of their own. */
export type LimitsMember = {
  id: string;
  type: UserType;
  role: Role;
  email: string;
  api: ReturnType<ApiSDK["forRole"]>;
  chat: AiAgentChat;
  webSearch: AiWebSearch;
  sdk: ApiSDK;
  /** Logs the member in again; the token store then holds a new token. */
  relogin: () => Promise<void>;
};

type LimitsFixtures = {
  /**
   * Creates a member and logs them in through their OWN request context.
   *
   * `apiSdk` shares one context, where every login stores a cookie that then
   * beats the Bearer token of every later call - so two logged-in members (or a
   * member plus the owner) in one context would quietly act as whoever logged in
   * last. One context per member keeps each call attributed to who it names.
   * Only one member per user type per test: the token store keeps one token per
   * type.
   */
  makeMember: (type: UserType) => Promise<LimitsMember>;
  /**
   * A second, unrelated portal with its own owner, deleted after the test. It is
   * where "an ID that belongs to another portal" comes from.
   */
  foreignPortal: { sdk: ApiSDK; paymentsApi: PaymentApi };
  /** Prints what the test's portal spent on AI, read from billing before the portal goes. */
  spendReport: void;
};

export const test = base.extend<LimitsFixtures>({
  makeMember: async ({ apiSdk, api, playwright }, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (type) => {
      const created = await apiSdk.addMember("owner", type);
      const context = await playwright.request.newContext({ timeout: 30000 });
      contexts.push(context);
      const sdk = new ApiSDK(context, api.tokenStore);
      const memberApi = await sdk.authenticateMember(created.userData, type);
      const id = created.data.response?.id;
      if (!id) throw new Error(`addMember(${type}) returned no id`);
      return {
        id,
        type,
        role: TYPE_TO_ROLE[type],
        email: created.userData.email,
        api: memberApi,
        chat: new AiAgentChat(context, api.tokenStore),
        webSearch: new AiWebSearch(context, api.tokenStore),
        sdk,
        relogin: async () => {
          await sdk.authenticateMember(created.userData, type);
        },
      };
    });
    for (const context of contexts) await context.dispose();
  },

  spendReport: [
    async ({ apiSdk }, use, testInfo) => {
      await use();
      let spent = 0;
      for (const serviceName of ["ai-tools", "ai-search"]) {
        const { status, data } = await apiSdk
          .forRole("owner")
          .payment.getCustomerOperations({
            offset: 0,
            limit: 100,
            serviceName: [serviceName],
            debit: true,
            credit: false,
            ...accountingPeriod(1),
          });
        // A portal that never became a billing customer has nothing to read.
        if (status !== 200) continue;
        for (const row of data.response?.collection ?? []) {
          spent += row.debit ?? 0;
        }
      }
      console.log(`LIMITS-SPEND ${spent.toFixed(6)} | ${testInfo.title}`);
    },
    { auto: true },
  ],

  foreignPortal: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({ timeout: 30000 });
    const foreign = new API(context);
    await foreign.setup();
    await use({
      sdk: new ApiSDK(context, foreign.tokenStore),
      paymentsApi: new PaymentApi(context, foreign.apisystem),
    });
    try {
      await foreign.auth.authenticateOwner();
      await foreign.cleanup();
    } catch (error) {
      console.warn(`ORPHANED PORTAL: ${foreign.portalDomain}: ${error}`);
    }
    await context.dispose();
  },
});

export { expect };
