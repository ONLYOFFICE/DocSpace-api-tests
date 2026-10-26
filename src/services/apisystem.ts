import { APIRequestContext } from "@playwright/test";
import config from "../../config";
import Auth from "./auth";
import { parseResponse } from "../utils/parse-response";

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

  get isLocal(): boolean {
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

    const maxRetries = 3;
    let lastError: unknown;
    let response;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await this.apiContext.post(registerUrl, {
          data: {
            portalName: this.portalName,
            firstName: "admin-zero",
            lastName: "admin-zero",
            email: config.DOCSPACE_OWNER_EMAIL,
            password: config.DOCSPACE_OWNER_PASSWORD,
            language: "en",
          },
        });
        break;
      } catch (e) {
        lastError = e;
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }

    if (!response) throw lastError;

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

    const maxRetries = 3;
    let lastError: unknown;
    let response;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await this.apiContext.delete(deleteUrl, {
          headers: {
            Authorization: `Bearer ${this.auth.authTokenOwner}`,
            Origin: `http://${this.portalName}`,
          },
          data: { reference: `${this.portalName}.onlyoffice.io` },
          timeout: 120000,
        });
        if (response.ok()) break;
        lastError = new Error(`HTTP ${response.status()}`);
      } catch (e) {
        lastError = e;
        response = undefined;
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }

    if (!response) throw lastError;

    const body = await parseResponse(response);

    if (!response.ok()) {
      throw new Error(
        `Failed to delete portal: ${response.status()} - ${body.error || body.message}`,
      );
    }
  }

  // A 200 from the delete endpoint only means the request was accepted: a live
  // portal answers /api/2.0/settings with 200, a deleted one with 404.
  async expectPortalGone(timeoutMs = 60000) {
    const url = `${this.portalBaseUrl}/api/2.0/settings`;
    const deadline = Date.now() + timeoutMs;
    let last = "";

    while (Date.now() < deadline) {
      try {
        const probe = await this.apiContext.get(url, { timeout: 15000 });
        if (probe.status() === 404) return;
        last = `HTTP ${probe.status()}`;
      } catch (error) {
        // The host no longer resolves or refuses the connection — also gone.
        return void error;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error(
      `Portal ${this.portalDomain} still answers after delete (${last}) — it was not removed`,
    );
  }

  // A portal that was registered but never became reachable would otherwise
  // fail later, inside whichever test ran first.
  async expectPortalReady(timeoutMs = 60000) {
    const url = `${this.portalBaseUrl}/api/2.0/settings`;
    const deadline = Date.now() + timeoutMs;
    let last = "no response";

    while (Date.now() < deadline) {
      try {
        const probe = await this.apiContext.get(url, { timeout: 15000 });
        if (probe.ok()) return;
        last = `HTTP ${probe.status()}`;
      } catch (error) {
        last = String(error).slice(0, 120);
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error(
      `Portal ${this.portalDomain} never became reachable (${last})`,
    );
  }
}

export default Apisystem;
