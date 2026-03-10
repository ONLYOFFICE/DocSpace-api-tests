import crypto from "node:crypto";
import config from "../../config";
import { APIRequestContext } from "@playwright/test";
import Apisystem from "./apisystem";
import { parseResponse } from "../utils/parse-response";

export class PaymentApi {
  private apiContext: APIRequestContext;
  private portalSetupApi: Apisystem;
  private machineKey: string;
  private pKey: string;

  constructor(apiContext: APIRequestContext, portalSetupApi: Apisystem) {
    if (!config.MACHINEKEY)
      throw new Error("MACHINEKEY is not set in environment variables");
    if (!config.PKEY)
      throw new Error("PKEY is not set in environment variables");
    this.apiContext = apiContext;
    this.portalSetupApi = portalSetupApi;
    this.machineKey = config.MACHINEKEY;
    this.pKey = config.PKEY;
  }

  private get portalDomain(): string {
    const domain = this.portalSetupApi.portalDomain;
    if (!domain) {
      throw new Error(
        "Portal domain is not set. Please create a portal first.",
      );
    }
    return domain;
  }

  createToken() {
    const now = new Date();
    const timestamp =
      now.getUTCFullYear() +
      String(now.getUTCMonth() + 1).padStart(2, "0") +
      String(now.getUTCDate()).padStart(2, "0") +
      String(now.getUTCHours()).padStart(2, "0") +
      String(now.getUTCMinutes()).padStart(2, "0") +
      String(now.getUTCSeconds()).padStart(2, "0");

    let authkey = crypto
      .createHmac("sha1", this.machineKey)
      .update(`${timestamp}\n${this.pKey}`)
      .digest("base64");

    authkey = authkey.replaceAll("+", "-").replaceAll("/", "_");
    authkey = authkey.slice(0, Math.max(0, authkey.length - 1));

    return `ASC ${this.pKey}:${timestamp}:${authkey}`;
  }

  async getPortalInfo() {
    const response = await this.apiContext.get(
      `${this.portalSetupApi.portalBaseUrl}/api/2.0/portal`,
    );
    if (!response.ok()) {
      const error = await parseResponse(response);
      throw new Error(
        `Failed to get portal info: ${error.message || "Unknown error"}`,
      );
    }
    const portalInfo = await parseResponse(response);
    const tenantId = portalInfo.response?.tenantId;
    if (!tenantId) {
      throw new Error("TenantId not found in portal info response");
    }
    return portalInfo.response;
  }

  async makePortalPayment(tenantId: string, quantity = 10) {
    const token = this.createToken();
    const region = process.env.AWS_REGION;
    const portalId =
      region === "us-east-2"
        ? `docspace.io.ohio${tenantId}`
        : `docspace.io${tenantId}`;

    const response = await this.apiContext.post(
      "https://payments.teamlab.info/api/license/setdspsaaspaid",
      {
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        data: {
          portalId,
          customerEmail: config.DOCSPACE_OWNER_EMAIL,
          quantity,
        },
      },
    );

    if (!response.ok()) {
      const error = await parseResponse(response);
      throw new Error(`Payment failed: ${error.message || "Unknown error"}`);
    }

    return response.json();
  }

  async refreshPaymentInfo() {
    const ownerToken = this.portalSetupApi.getOwnerAuthToken();
    if (!ownerToken) {
      throw new Error("Owner token is missing. Please authenticate first.");
    }

    const headers = {
      Authorization: `Bearer ${ownerToken}`,
      Accept: "application/json",
    };

    const tariffResponse = await this.apiContext.get(
      `${this.portalSetupApi.portalBaseUrl}/api/2.0/portal/tariff`,
      { headers, params: { refresh: true } },
    );
    if (!tariffResponse.ok()) {
      const error = await tariffResponse.json();
      throw new Error(
        `Failed to refresh tariff info: ${error.message || "Unknown error"}`,
      );
    }

    const quotaResponse = await this.apiContext.get(
      `${this.portalSetupApi.portalBaseUrl}/api/2.0/portal/payment/quota`,
      { headers, params: { refresh: true } },
    );
    if (!quotaResponse.ok()) {
      const error = await quotaResponse.json();
      throw new Error(
        `Failed to refresh quota info: ${error.message || "Unknown error"}`,
      );
    }

    return {
      tariff: await tariffResponse.json(),
      quota: await quotaResponse.json(),
    };
  }

  async setupPayment(quantity = 10) {
    if (this.portalSetupApi.isLocal) {
      return;
    }
    const portalInfo = await this.getPortalInfo();
    const payment = await this.makePortalPayment(portalInfo.tenantId, quantity);
    const refresh = await this.refreshPaymentInfo();
    return { payment, refresh };
  }
}
