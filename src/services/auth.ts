import { APIRequestContext } from "@playwright/test";
import config from "../../config";
import { TokenStore } from "./token-store";

class Auth {
  apiRequestContext: APIRequestContext;
  private tokenStore: TokenStore;

  constructor(apiRequestContext: APIRequestContext, tokenStore: TokenStore) {
    this.apiRequestContext = apiRequestContext;
    this.tokenStore = tokenStore;
  }

  get authTokenOwner(): string {
    return this.tokenStore.getToken("owner");
  }

  get portalDomain(): string {
    return this.tokenStore.portalDomain;
  }

  async authenticateOwner() {
    const userName = config.DOCSPACE_OWNER_EMAIL;
    const password = config.DOCSPACE_OWNER_PASSWORD;

    const authResponse = await this.apiRequestContext.post(
      `${this.tokenStore.portalBaseUrl}/api/2.0/authentication`,
      {
        data: { userName, password },
        headers: {
          Origin: `http://${this.tokenStore.newTenantDomain}`
        },
      },
    );

    const authBody = await authResponse.json();

    if (!authResponse.ok()) {
      throw new Error(
        `Authentication failed: ${authResponse.status()} - ${authBody.error || authBody.message}`,
      );
    }

    this.tokenStore.setToken("owner", authBody.response.token);

    return this.authTokenOwner;
  }
}

export default Auth;
