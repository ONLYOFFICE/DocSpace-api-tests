import { APIRequestContext } from "@playwright/test";
import config from "../../config";
import Auth from "./auth";

class Apisystem {
  apiContext: APIRequestContext;
  portalDomain: string = "";
  adminUserId: string = "";
  portalName: string = "";

  private auth: Auth;

  constructor(apiContext: APIRequestContext, auth: Auth) {
    this.apiContext = apiContext;
    this.auth = auth;
  }

  getOwnerAuthToken(): string {
    return this.auth.authTokenOwner;
  }

  private get isLocal(): boolean {
    return !!config.LOCAL_PORTAL_DOMAIN;
  }

  get portalBaseUrl(): string {
    const scheme = this.isLocal ? "http" : "https";
    return `${scheme}://${this.portalDomain}`;
  }

  async createPortal(portalNamePrefix = "test-portal") {
    const datePrefix = new Date().toISOString().replace(/[:.]/g, "-");
    const randomPrefix = Math.random().toString(36).slice(2, 8);

    this.portalName = `${portalNamePrefix}-${randomPrefix}-${datePrefix}`;

    const registerUrl = this.isLocal
      ? `http://${config.LOCAL_PORTAL_DOMAIN}/apisystem/portal/register`
      : `${config.PORTAL_REGISTRATION_URL}/register`;

    const response = await this.apiContext.post(registerUrl, {
      data: {
        portalName: this.portalName,
        firstName: "admin-zero",
        lastName: "admin-zero",
        email: config.DOCSPACE_OWNER_EMAIL,
        password: config.DOCSPACE_OWNER_PASSWORD,
        language: "en",
      },
    });

    const text = await response.text();
    if (!response.ok()) {
      throw new Error(
        `Failed to create portal: ${response.status()} - ${text}`,
      );
    }
    const body = JSON.parse(text);

    this.portalDomain = this.isLocal
      ? config.LOCAL_PORTAL_DOMAIN
      : body.tenant.domain;
    this.adminUserId = body.tenant.ownerId;

    return body;
  }

  async deletePortal() {
    if (!this.auth.authTokenOwner) {
      throw new Error("Owner token is missing. Cannot delete portal.");
    }

    const deleteUrl = `${this.portalBaseUrl}/api/2.0/portal/deleteportalimmediately`;
    const response = await this.apiContext.delete(deleteUrl, {
      headers: { 
        Authorization:`Bearer ${this.auth.authTokenOwner}`,
        Origin: `http://${this.portalName}`,
      },
      data: { reference: `${this.portalName}.onlyoffice.io` },
    });
    const body = await response.json();

    if (!response.ok()) {
      throw new Error(
        `Failed to delete portal: ${response.status()} - ${body.error || body.message}`,
      );
    }
  }
}

export default Apisystem;
