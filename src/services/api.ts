import { APIRequestContext } from "@playwright/test";

import config from "../../config";
import Apisystem from "./apisystem";
import Auth from "./auth";
import { TokenStore } from "./token-store";

class API {
  ownerContext: APIRequestContext;

  portalDomain: string = "";
  adminUserId: string = "";

  tokenStore: TokenStore;
  apisystem: Apisystem;
  auth: Auth;

  get apiContext(): APIRequestContext {
    return this.ownerContext;
  }

  constructor(ownerContext: APIRequestContext) {
    this.ownerContext = ownerContext;

    this.tokenStore = new TokenStore();
    this.auth = new Auth(ownerContext, this.tokenStore);
    this.apisystem = new Apisystem(ownerContext, this.auth);
  }

  async setup() {
    const portal = await this.apisystem.createPortal("integration-test-portal");

    this.portalDomain = config.LOCAL_PORTAL_DOMAIN || portal.tenant.domain;
    this.adminUserId = portal.tenant.ownerId;

    this.tokenStore.portalDomain = this.portalDomain;
    this.tokenStore.isLocal = !!config.LOCAL_PORTAL_DOMAIN;
    await this.auth.authenticateOwner();
  }

  async cleanup() {
    await this.apisystem.deletePortal();
  }
}

export default API;
